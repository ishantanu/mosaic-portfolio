package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"mosaic/internal/adapters/postgres"
	"mosaic/internal/adapters/trading212"
	"mosaic/internal/application"
	"mosaic/internal/observability"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel/trace"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)
	shutdownTelemetry, err := observability.Setup(context.Background(), logger)
	if err != nil {
		logger.Error("observability_setup_failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer func() {
		if shutdownErr := shutdownTelemetry(context.Background()); shutdownErr != nil {
			logger.Error("observability_shutdown_failed", slog.String("error", shutdownErr.Error()))
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	apiKey := os.Getenv("TRADING212_API_KEY")
	apiSecret := os.Getenv("TRADING212_SECRET_KEY")
	accountID := os.Getenv("TRADING212_ACCOUNT_ID")
	if accountID == "" {
		accountID = "demo-account"
	}

	client := trading212.NewClient(apiKey, apiSecret)
	connector := trading212.NewConnector(client)
	service := application.NewPortfolioService(connector)
	demoMode := strings.EqualFold(os.Getenv("MOSAIC_DEMO_MODE"), "true")

	if len(os.Args) > 1 && (os.Args[1] == "serve" || os.Args[1] == "server") {
		if !demoMode && (apiKey == "" || apiSecret == "") {
			fmt.Fprintln(os.Stderr, "TRADING212_API_KEY and TRADING212_SECRET_KEY must be set unless MOSAIC_DEMO_MODE=true")
			os.Exit(1)
		}
		serveFlagSet := flag.NewFlagSet("serve", flag.ExitOnError)
		portFlag := serveFlagSet.String("port", "", "HTTP port (overrides PORT env var)")
		_ = serveFlagSet.Parse(os.Args[2:])

		port := *portFlag
		if port == "" {
			port = os.Getenv("PORT")
		}
		if port == "" {
			port = "8081"
		}

		if err := startAPIServer(client, service, accountID, port, demoMode); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}

	if len(os.Args) > 1 && os.Args[1] == "get" {
		if len(os.Args) < 3 {
			printUsage()
			os.Exit(1)
		}

		switch os.Args[2] {
		case "cash":
			cash, err := client.GetAccountCash(ctx, accountID)
			if err != nil {
				panic(err)
			}
			printJSON("cash", cash)
		case "orders-history":
			query := parseHistoryFlags(os.Args[3:])
			orders, err := client.GetOrdersHistory(ctx, accountID, query)
			if err != nil {
				panic(err)
			}
			printJSON("orders-history", orders)
		case "dividends":
			query := parseHistoryFlags(os.Args[3:])
			dividends, err := client.GetDividends(ctx, accountID, query)
			if err != nil {
				panic(err)
			}
			printJSON("dividends", dividends)
		case "transactions-history", "historical-events":
			query := parseHistoryFlags(os.Args[3:])
			transactions, err := client.GetTransactionsHistory(ctx, accountID, query)
			if err != nil {
				panic(err)
			}
			printJSON("transactions-history", transactions)
		case "export-reports", "getreports":
			reports, err := client.GetExportReports(ctx, accountID)
			if err != nil {
				panic(err)
			}
			printJSON("export-reports", reports)
		case "exchanges-metadata":
			exchanges, err := client.GetExchangesMetadata(ctx, accountID)
			if err != nil {
				panic(err)
			}
			printJSON("exchanges-metadata", exchanges)
		case "all-instruments":
			instruments, err := client.GetAllInstruments(ctx, accountID)
			if err != nil {
				panic(err)
			}
			printJSON("all-instruments", instruments)
		case "open-positions":
			positions, err := client.GetOpenPositions(ctx, accountID, parseTickerFlag(os.Args[3:]))
			if err != nil {
				panic(err)
			}
			printJSON("open-positions", positions)
		case "all":
			cash, err := client.GetAccountCash(ctx, accountID)
			if err != nil {
				panic(err)
			}
			printJSON("cash", cash)

			orders, err := client.GetOrdersHistory(ctx, accountID, parseHistoryFlags(os.Args[3:]))
			if err != nil {
				panic(err)
			}
			printJSON("orders-history", orders)

			dividends, err := client.GetDividends(ctx, accountID, parseHistoryFlags(os.Args[3:]))
			if err != nil {
				panic(err)
			}
			printJSON("dividends", dividends)

			exchanges, err := client.GetExchangesMetadata(ctx, accountID)
			if err != nil {
				panic(err)
			}
			printJSON("exchanges-metadata", exchanges)

			instruments, err := client.GetAllInstruments(ctx, accountID)
			if err != nil {
				panic(err)
			}
			printJSON("all-instruments", instruments)

			positions, err := client.GetOpenPositions(ctx, accountID, parseTickerFlag(os.Args[3:]))
			if err != nil {
				panic(err)
			}
			printJSON("open-positions", positions)
		case "account-summary":
			accountSummary, err := service.SyncAccountSummary(ctx, accountID)
			if err != nil {
				panic(err)
			}
			printJSON("account-summary", accountSummary)
		case "portfolio":
			portfolio, err := service.Sync(ctx, accountID)
			if err != nil {
				panic(err)
			}
			printJSON("portfolio", portfolio)
		default:
			printUsage()
			os.Exit(1)
		}

		return
	}

	if len(os.Args) > 1 && os.Args[1] == "create" {
		if len(os.Args) < 3 {
			printUsage()
			os.Exit(1)
		}

		switch os.Args[2] {
		case "export-report":
			req := parseExportFlags(os.Args[3:])
			report, err := client.CreateExportReport(ctx, accountID, req)
			if err != nil {
				panic(err)
			}
			printJSON("create-export-report", report)
		default:
			printUsage()
			os.Exit(1)
		}

		return
	}

	accountSummary, err := service.SyncAccountSummary(ctx, accountID)
	if err != nil {
		panic(err)
	}
	printJSON("account-summary", accountSummary)

	portfolio, err := service.Sync(ctx, accountID)
	if err != nil {
		fmt.Printf("portfolio unavailable in demo mode: %v\n", err)
	} else {
		printJSON("portfolio", portfolio)
	}
}

func parseHistoryFlags(args []string) trading212.QueryOptions {
	flagSet := flag.NewFlagSet("history", flag.ContinueOnError)
	cursor := flagSet.String("cursor", "0", "cursor value to start from")
	ticker := flagSet.String("ticker", "", "ticker filter")
	limit := flagSet.Int("limit", 21, "records to return")
	if err := flagSet.Parse(args); err != nil {
		return trading212.QueryOptions{Cursor: "0", Limit: 21}
	}

	return trading212.QueryOptions{
		Cursor: *cursor,
		Ticker: *ticker,
		Limit:  *limit,
	}
}

func parseTickerFlag(args []string) string {
	flagSet := flag.NewFlagSet("ticker", flag.ContinueOnError)
	ticker := flagSet.String("ticker", "", "ticker filter")
	if err := flagSet.Parse(args); err != nil {
		return ""
	}
	return *ticker
}

func parseExportFlags(args []string) trading212.CreateExportRequest {
	flagSet := flag.NewFlagSet("export", flag.ContinueOnError)
	fromStr := flagSet.String("from", "", "start time in RFC3339 format")
	toStr := flagSet.String("to", "", "end time in RFC3339 format")
	_ = flagSet.Parse(args)

	now := time.Now().UTC()
	timeFrom := now.AddDate(0, -1, 0)
	timeTo := now

	if *fromStr != "" {
		if t, err := time.Parse(time.RFC3339, *fromStr); err == nil {
			timeFrom = t
		}
	}
	if *toStr != "" {
		if t, err := time.Parse(time.RFC3339, *toStr); err == nil {
			timeTo = t
		}
	}

	return trading212.CreateExportRequest{
		DataIncluded: trading212.ExportDataIncluded{
			IncludeDividends:    true,
			IncludeInterest:     true,
			IncludeOrders:       true,
			IncludeTransactions: true,
		},
		TimeFrom: timeFrom,
		TimeTo:   timeTo,
	}
}

type cacheEntry struct {
	data     []byte
	cachedAt time.Time
}

type apiCache struct {
	entries map[string]cacheEntry
	mu      sync.Mutex
	ttl     time.Duration
}

func newAPICache(ttl time.Duration) *apiCache {
	return &apiCache{
		entries: make(map[string]cacheEntry),
		ttl:     ttl,
	}
}

// Get returns a cached response even once it has expired.  Keeping the stale
// value lets the API remain useful when a broker rate-limits a scheduled refresh.
func (c *apiCache) Get(key string) ([]byte, bool, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, found := c.entries[key]
	if !found {
		return nil, false, false
	}
	return entry.data, time.Since(entry.cachedAt) <= c.ttl, true
}

func (c *apiCache) Set(key string, data []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[key] = cacheEntry{
		data:     data,
		cachedAt: time.Now(),
	}
}

type statusResponseWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusResponseWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusResponseWriter) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(data)
}

func requestLogger(next http.Handler, logger *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		startedAt := time.Now()
		recorder := &statusResponseWriter{ResponseWriter: w}
		next.ServeHTTP(recorder, r)
		spanContext := trace.SpanContextFromContext(r.Context())
		attributes := []slog.Attr{
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Int("status_code", recorder.status),
			slog.Duration("duration", time.Since(startedAt)),
		}
		if requestID := r.Header.Get("X-Mosaic-Client-Request-ID"); requestID != "" {
			attributes = append(attributes, slog.String("client_request_id", requestID))
		}
		if spanContext.IsValid() {
			attributes = append(attributes, slog.String("trace_id", spanContext.TraceID().String()), slog.String("span_id", spanContext.SpanID().String()))
		}
		logger.LogAttrs(r.Context(), slog.LevelInfo, "http_request_completed", attributes...)
	})
}

func startAPIServer(client *trading212.Client, service *application.PortfolioService, accountID string, port string, demoMode bool) error {
	logger := slog.Default()
	refreshInterval := 15 * time.Minute
	if configured := os.Getenv("BROKER_REFRESH_INTERVAL"); configured != "" {
		interval, err := time.ParseDuration(configured)
		if err != nil || interval <= 0 {
			return fmt.Errorf("BROKER_REFRESH_INTERVAL must be a positive duration (for example 15m)")
		}
		refreshInterval = interval
	}
	cache := newAPICache(refreshInterval)
	demo := newDemoFixture("mosaic-demo")
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return fmt.Errorf("DATABASE_URL must be set when running the API server")
	}
	history, err := postgres.NewPortfolioHistoryStore(context.Background(), databaseURL, refreshInterval)
	if err != nil {
		return fmt.Errorf("initialise portfolio history: %w", err)
	}
	defer history.Close()
	recordPortfolioValue := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		summary := &demo.summary
		var summaryErr error
		if !demoMode {
			summary, summaryErr = service.SyncAccountSummary(ctx, accountID)
		}
		if summaryErr != nil {
			logger.Error("portfolio_history_refresh_failed", slog.String("error", summaryErr.Error()))
			return
		}
		// The scheduled valuation request doubles as the cached account summary,
		// avoiding an immediate second upstream call when the dashboard opens.
		if data, marshalErr := json.Marshal(summary); marshalErr == nil {
			cache.Set("account-summary", data)
		}
		if recordErr := history.Record(ctx, accountID, application.PortfolioValueSnapshot{At: time.Now().UTC(), TotalValue: summary.TotalValue, Cash: summary.Cash, Currency: summary.Currency}); recordErr != nil {
			logger.Error("portfolio_history_write_failed", slog.String("error", recordErr.Error()))
		}
	}
	go func() {
		recordPortfolioValue()
		ticker := time.NewTicker(refreshInterval)
		defer ticker.Stop()
		for range ticker.C {
			recordPortfolioValue()
		}
	}()
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if err := history.Ping(r.Context()); err != nil {
			http.Error(w, "database unavailable", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	allowedOrigin := os.Getenv("CORS_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "http://localhost:5173"
	}

	serveCachedJSON := func(
		w http.ResponseWriter,
		r *http.Request,
		cacheKey string,
		fetch func(context.Context) (any, error),
	) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Vary", "Origin")
		staleData, fresh, found := cache.Get(cacheKey)
		w.Header().Set("Cache-Control", fmt.Sprintf("private, max-age=%d", int(refreshInterval.Seconds())))
		if fresh {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-Cache", "HIT")
			_, _ = w.Write(staleData)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		value, err := fetch(ctx)
		if err != nil {
			if found {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("X-Cache", "STALE")
				w.Header().Set("Warning", `110 - "Mosaic is showing the last successful broker response"`)
				_, _ = w.Write(staleData)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		data, err := json.Marshal(value)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		cache.Set(cacheKey, data)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "MISS")
		_, _ = w.Write(data)
	}

	// Keep the API usable by an independently served frontend in development.
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, traceparent, X-Mosaic-Client-Request-ID")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		http.NotFound(w, r)
	})

	mux.HandleFunc("/api/account-summary", func(w http.ResponseWriter, r *http.Request) {
		serveCachedJSON(w, r, "account-summary", func(ctx context.Context) (any, error) {
			if demoMode {
				return demo.summary, nil
			}
			return service.SyncAccountSummary(ctx, accountID)
		})
	})

	mux.HandleFunc("/api/portfolio-history", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Content-Type", "application/json")
		snapshots, err := history.List(r.Context(), accountID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := json.NewEncoder(w).Encode(snapshots); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})

	mux.HandleFunc("/api/positions", func(w http.ResponseWriter, r *http.Request) {
		serveCachedJSON(w, r, "positions", func(ctx context.Context) (any, error) {
			if demoMode {
				return demo.positions, nil
			}
			return client.GetOpenPositions(ctx, accountID, "")
		})
	})

	mux.HandleFunc("/api/transactions", func(w http.ResponseWriter, r *http.Request) {
		serveCachedJSON(w, r, "transactions", func(ctx context.Context) (any, error) {
			if demoMode {
				return demo.transactions, nil
			}
			return client.GetAllTransactionsHistory(ctx, accountID)
		})
	})

	mux.HandleFunc("/api/orders", func(w http.ResponseWriter, r *http.Request) {
		serveCachedJSON(w, r, "orders", func(ctx context.Context) (any, error) {
			if demoMode {
				return demo.orders, nil
			}
			return client.GetOrdersHistory(ctx, accountID, trading212.QueryOptions{Cursor: "0", Limit: 50})
		})
	})

	mux.HandleFunc("/api/dividends", func(w http.ResponseWriter, r *http.Request) {
		serveCachedJSON(w, r, "dividends", func(ctx context.Context) (any, error) {
			if demoMode {
				return demo.dividends, nil
			}
			return client.GetDividends(ctx, accountID, trading212.QueryOptions{Cursor: "0", Limit: 20})
		})
	})

	mux.HandleFunc("/api/portfolio", func(w http.ResponseWriter, r *http.Request) {
		serveCachedJSON(w, r, "portfolio", func(ctx context.Context) (any, error) {
			if demoMode {
				return demo.portfolio, nil
			}
			return service.Sync(ctx, accountID)
		})
	})

	if demoMode {
		logger.Info("demo_mode_enabled")
	}
	logger.Info("api_listening", slog.String("port", port), slog.Bool("demo_mode", demoMode))
	if err := http.ListenAndServe(":"+port, otelhttp.NewHandler(requestLogger(mux, logger), "mosaic.http")); err != nil {
		return fmt.Errorf("serve API: %w", err)
	}
	return nil
}

func printUsage() {
	fmt.Println("Usage:")
	fmt.Println("  mosaic serve [--port 8081]")
	fmt.Println("  mosaic get cash")
	fmt.Println("  mosaic get orders-history [--cursor 0 --ticker <symbol> --limit 21]")
	fmt.Println("  mosaic get dividends [--cursor 0 --ticker <symbol> --limit 21]")
	fmt.Println("  mosaic get transactions-history [--cursor 0 --limit 21]")
	fmt.Println("  mosaic get export-reports")
	fmt.Println("  mosaic get open-positions [--ticker <symbol>]")
	fmt.Println("  mosaic get exchanges-metadata")
	fmt.Println("  mosaic get all-instruments")
	fmt.Println("  mosaic get account-summary")
	fmt.Println("  mosaic get portfolio")
	fmt.Println("  mosaic create export-report [--from RFC3339] [--to RFC3339]")
}

func printJSON(label string, value any) {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		fmt.Printf("%s: %v\n", strings.ToUpper(label), value)
		return
	}

	fmt.Printf("%s:\n%s\n", strings.ToUpper(label), encoded)
}
