package postgres

import (
	"context"
	_ "embed"
	"encoding/json"

	"mosaic/internal/application"
)

//go:embed migrations/002_csv_imports.sql
var importsSchema string

func (s *PortfolioHistoryStore) SaveImport(ctx context.Context, owner string, p *application.ImportedPortfolio) (bool, error) {
	holdings, err := json.Marshal(p.Holdings)
	if err != nil {
		return false, err
	}
	result, err := s.pool.Exec(ctx, `INSERT INTO imported_portfolios (owner_id, id, snapshot_at, holdings) VALUES ($1, $2, $3, $4) ON CONFLICT (owner_id, id) DO NOTHING`, owner, p.ID, p.SnapshotAt, holdings)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() == 1, nil
}

func (s *PortfolioHistoryStore) ListImports(ctx context.Context, owner string) ([]application.ImportedPortfolio, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, imported_at, snapshot_at FROM imported_portfolios WHERE owner_id = $1 ORDER BY imported_at DESC LIMIT 100`, owner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []application.ImportedPortfolio{}
	for rows.Next() {
		var p application.ImportedPortfolio
		if err := rows.Scan(&p.ID, &p.ImportedAt, &p.SnapshotAt); err != nil {
			return nil, err
		}
		items = append(items, p)
	}
	return items, rows.Err()
}

func (s *PortfolioHistoryStore) GetImport(ctx context.Context, owner, id string) (*application.ImportedPortfolio, error) {
	var p application.ImportedPortfolio
	var holdings []byte
	err := s.pool.QueryRow(ctx, `SELECT id, imported_at, snapshot_at, holdings FROM imported_portfolios WHERE owner_id = $1 AND id = $2`, owner, id).Scan(&p.ID, &p.ImportedAt, &p.SnapshotAt, &holdings)
	if err != nil {
		return nil, err
	}
	err = json.Unmarshal(holdings, &p.Holdings)
	return &p, err
}
