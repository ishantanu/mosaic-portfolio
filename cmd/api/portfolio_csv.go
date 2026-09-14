package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5"
	"mosaic/internal/application"
	"mosaic/internal/domain"
)

type portfolioImportStore interface {
	SaveImport(context.Context, string, *application.ImportedPortfolio) (bool, error)
	ListImports(context.Context, string) ([]application.ImportedPortfolio, error)
	GetImport(context.Context, string, string) (*application.ImportedPortfolio, error)
}

func registerPortfolioCSV(mux *http.ServeMux, store portfolioImportStore, owner, allowedOrigin string, fetch func(context.Context) (*domain.Portfolio, error)) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Vary", "Origin")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		origin := r.Header.Get("Origin")
		if origin != "" {
			u, err := url.Parse(origin)
			sameHost := err == nil && u.Host == r.Host && (u.Scheme == "http" || u.Scheme == "https")
			if origin != allowedOrigin && !sameHost {
				http.Error(w, "origin not allowed", http.StatusForbidden)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, traceparent, X-Mosaic-Client-Request-ID")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		respond := func(v any) { w.Header().Set("Content-Type", "application/json"); _ = json.NewEncoder(w).Encode(v) }
		if r.Method == http.MethodGet && r.URL.Path == "/api/portfolio/export" {
			var p *domain.Portfolio
			var err error
			if id := r.URL.Query().Get("id"); id != "" {
				var saved *application.ImportedPortfolio
				saved, err = store.GetImport(ctx, owner, id)
				if err == nil {
					p = &domain.Portfolio{Holdings: saved.Holdings, LastSynced: saved.SnapshotAt}
				}
			} else {
				p, err = fetch(ctx)
			}
			if errors.Is(err, pgx.ErrNoRows) {
				http.NotFound(w, r)
				return
			}
			if err != nil {
				http.Error(w, "Could not load portfolio for export. Try again later.", http.StatusBadGateway)
				return
			}
			data, err := application.ExportPortfolioCSV(*p)
			if err != nil {
				http.Error(w, err.Error(), http.StatusUnprocessableEntity)
				return
			}
			w.Header().Set("Content-Type", "text/csv; charset=utf-8")
			w.Header().Set("Content-Disposition", `attachment; filename="mosaic-holdings.csv"`)
			_, _ = w.Write(data)
			return
		}
		if r.Method == http.MethodGet && r.URL.Path == "/api/portfolio/imports" {
			if id := r.URL.Query().Get("id"); id != "" {
				item, err := store.GetImport(ctx, owner, id)
				if errors.Is(err, pgx.ErrNoRows) {
					http.NotFound(w, r)
					return
				}
				if err != nil {
					http.Error(w, "Could not load imported snapshot.", 500)
					return
				}
				respond(item)
			} else {
				items, err := store.ListImports(ctx, owner)
				if err != nil {
					http.Error(w, "Could not load imported snapshots.", 500)
					return
				}
				respond(items)
			}
			return
		}
		if r.Method == http.MethodPost && (r.URL.Path == "/api/portfolio/imports" || r.URL.Path == "/api/portfolio/imports/preview") {
			// A non-simple content type prevents cross-site HTML forms from writing.
			if r.Header.Get("Content-Type") != "text/csv" {
				http.Error(w, "Content-Type must be text/csv", http.StatusUnsupportedMediaType)
				return
			}
			data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, application.MaxCSVBytes))
			if err != nil {
				http.Error(w, "CSV must be 2 MiB or smaller", http.StatusRequestEntityTooLarge)
				return
			}
			p, err := application.ParsePortfolioCSV(data)
			if err != nil {
				http.Error(w, err.Error(), http.StatusUnprocessableEntity)
				return
			}
			if r.URL.Path == "/api/portfolio/imports/preview" {
				respond(p)
				return
			}
			created, err := store.SaveImport(ctx, owner, p)
			if err != nil {
				http.Error(w, "Could not confirm import. Retry safely; identical snapshots will not be duplicated.", 500)
				return
			}
			respond(map[string]any{"id": p.ID, "created": created})
			return
		}
		w.Header().Set("Allow", "GET, POST, OPTIONS")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
	for _, path := range []string{"/api/portfolio/export", "/api/portfolio/imports", "/api/portfolio/imports/preview"} {
		mux.HandleFunc(path, handler)
	}
}
