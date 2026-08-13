package postgres

import (
	"context"
	_ "embed"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"

	"mosaic/internal/application"
)

//go:embed migrations/001_portfolio_history.sql
var initialSchema string

var tracer = otel.Tracer("mosaic/internal/adapters/postgres")

type PortfolioHistoryStore struct {
	pool        *pgxpool.Pool
	minInterval time.Duration
}

func NewPortfolioHistoryStore(ctx context.Context, databaseURL string, minInterval time.Duration) (*PortfolioHistoryStore, error) {
	ctx, span := tracer.Start(ctx, "postgres.portfolio_history.connect")
	defer span.End()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, fmt.Errorf("create postgres pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		pool.Close()
		return nil, fmt.Errorf("connect to postgres: %w", err)
	}
	if err := applyMigrations(ctx, pool); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		pool.Close()
		return nil, err
	}
	return &PortfolioHistoryStore{pool: pool, minInterval: minInterval}, nil
}

func applyMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	ctx, span := tracer.Start(ctx, "postgres.portfolio_history.migrate")
	defer span.End()
	span.SetAttributes(attribute.String("db.system.name", "postgresql"))
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return fmt.Errorf("begin database migration: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// This lock lets multiple API replicas start safely against the same database.
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(414217001)"); err != nil {
		return fmt.Errorf("lock database migration: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`); err != nil {
		return fmt.Errorf("create migration ledger: %w", err)
	}

	var applied int
	err = tx.QueryRow(ctx, "SELECT version FROM schema_migrations WHERE version = 1").Scan(&applied)
	if err != nil && err != pgx.ErrNoRows {
		return fmt.Errorf("read migration ledger: %w", err)
	}
	if err == pgx.ErrNoRows {
		if _, err := tx.Exec(ctx, initialSchema); err != nil {
			return fmt.Errorf("apply migration 001: %w", err)
		}
		if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES (1)"); err != nil {
			return fmt.Errorf("record migration 001: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit database migration: %w", err)
	}
	return nil
}

func (s *PortfolioHistoryStore) Record(ctx context.Context, accountID string, snapshot application.PortfolioValueSnapshot) error {
	ctx, span := tracer.Start(ctx, "postgres.portfolio_history.record")
	defer span.End()
	span.SetAttributes(attribute.String("db.system.name", "postgresql"))
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return fmt.Errorf("begin portfolio snapshot transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Serialize writes for an account so parallel dashboard requests cannot add
	// duplicate snapshots inside the recording interval.
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext($1))", accountID); err != nil {
		return fmt.Errorf("lock portfolio snapshots: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO accounts (id, broker, base_currency)
		VALUES ($1, 'TRADING212', $2)
		ON CONFLICT (id) DO UPDATE SET base_currency = EXCLUDED.base_currency, updated_at = now()`, accountID, snapshot.Currency); err != nil {
		return fmt.Errorf("upsert snapshot account: %w", err)
	}

	var latest time.Time
	err = tx.QueryRow(ctx, `
		SELECT recorded_at FROM portfolio_snapshots
		WHERE account_id = $1 ORDER BY recorded_at DESC LIMIT 1`, accountID).Scan(&latest)
	if err != nil && err != pgx.ErrNoRows {
		return fmt.Errorf("read latest portfolio snapshot: %w", err)
	}
	if err == nil && snapshot.At.Sub(latest) < s.minInterval {
		return tx.Commit(ctx)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO portfolio_snapshots (account_id, recorded_at, total_value, cash, currency)
		VALUES ($1, $2, $3, $4, $5)`, accountID, snapshot.At, snapshot.TotalValue, snapshot.Cash, snapshot.Currency); err != nil {
		return fmt.Errorf("insert portfolio snapshot: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit portfolio snapshot: %w", err)
	}
	return nil
}

func (s *PortfolioHistoryStore) List(ctx context.Context, accountID string) ([]application.PortfolioValueSnapshot, error) {
	ctx, span := tracer.Start(ctx, "postgres.portfolio_history.list")
	defer span.End()
	span.SetAttributes(attribute.String("db.system.name", "postgresql"))
	rows, err := s.pool.Query(ctx, `
		SELECT recorded_at, total_value, cash, currency
		FROM portfolio_snapshots WHERE account_id = $1 ORDER BY recorded_at`, accountID)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, fmt.Errorf("list portfolio history: %w", err)
	}
	defer rows.Close()

	snapshots := make([]application.PortfolioValueSnapshot, 0)
	for rows.Next() {
		var snapshot application.PortfolioValueSnapshot
		if err := rows.Scan(&snapshot.At, &snapshot.TotalValue, &snapshot.Cash, &snapshot.Currency); err != nil {
			return nil, fmt.Errorf("scan portfolio snapshot: %w", err)
		}
		snapshots = append(snapshots, snapshot)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate portfolio history: %w", err)
	}
	return snapshots, nil
}

func (s *PortfolioHistoryStore) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

func (s *PortfolioHistoryStore) Close() { s.pool.Close() }
