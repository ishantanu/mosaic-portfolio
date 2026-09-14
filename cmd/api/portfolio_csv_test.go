package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5"
	"mosaic/internal/application"
	"mosaic/internal/domain"
)

type memoryImports struct {
	items map[string]*application.ImportedPortfolio
}

func (s *memoryImports) SaveImport(_ context.Context, owner string, p *application.ImportedPortfolio) (bool, error) {
	key := owner + p.ID
	if s.items[key] != nil {
		return false, nil
	}
	s.items[key] = p
	return true, nil
}
func (s *memoryImports) ListImports(_ context.Context, owner string) ([]application.ImportedPortfolio, error) {
	return []application.ImportedPortfolio{}, nil
}
func (s *memoryImports) GetImport(_ context.Context, owner, id string) (*application.ImportedPortfolio, error) {
	p := s.items[owner+id]
	if p == nil {
		return nil, pgx.ErrNoRows
	}
	return p, nil
}

func TestCSVAPIFlow(t *testing.T) {
	store := &memoryImports{items: map[string]*application.ImportedPortfolio{}}
	mux := http.NewServeMux()
	demo := newDemoFixture("demo")
	registerPortfolioCSV(mux, store, "owner", "http://localhost:5173", func(context.Context) (*domain.Portfolio, error) { return &demo.portfolio, nil })
	request := func(method, path string, body []byte, origin, contentType string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, bytes.NewReader(body))
		r.Header.Set("Origin", origin)
		r.Header.Set("Content-Type", contentType)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	export := request("GET", "/api/portfolio/export", nil, "", "")
	if export.Code != 200 || export.Header().Get("Content-Disposition") == "" {
		t.Fatal(export.Body.String())
	}
	preview := request("POST", "/api/portfolio/imports/preview", export.Body.Bytes(), "http://localhost:5173", "text/csv")
	if preview.Code != 200 || len(store.items) != 0 {
		t.Fatal("preview wrote data or failed", preview.Body.String())
	}
	var p application.ImportedPortfolio
	_ = json.Unmarshal(preview.Body.Bytes(), &p)
	for i := 0; i < 2; i++ {
		response := request("POST", "/api/portfolio/imports", export.Body.Bytes(), "", "text/csv")
		var result struct{ Created bool }
		_ = json.Unmarshal(response.Body.Bytes(), &result)
		if response.Code != 200 || result.Created != (i == 0) || len(store.items) != 1 {
			t.Fatal("duplicate protection failed")
		}
	}
	reExport := request("GET", "/api/portfolio/export?id="+p.ID, nil, "", "")
	restored, err := application.ParsePortfolioCSV(reExport.Body.Bytes())
	if err != nil || restored.ID != p.ID {
		t.Fatal("re-export did not round trip", err)
	}
	for _, tc := range []struct {
		method, path, origin, contentType string
		body                              []byte
		status                            int
	}{
		{"POST", "/api/portfolio/imports", "https://evil.example", "text/csv", export.Body.Bytes(), 403},
		{"POST", "/api/portfolio/imports", "", "text/plain", export.Body.Bytes(), 415},
		{"POST", "/api/portfolio/imports", "", "text/csv", []byte("invalid"), 422},
		{"POST", "/api/portfolio/imports", "", "text/csv", bytes.Repeat([]byte("a"), application.MaxCSVBytes+1), 413},
		{"GET", "/api/portfolio/imports?id=missing", "", "", nil, 404},
		{"DELETE", "/api/portfolio/imports", "", "", nil, 405},
		{"OPTIONS", "/api/portfolio/imports", "http://localhost:5173", "", nil, 204},
	} {
		w := request(tc.method, tc.path, tc.body, tc.origin, tc.contentType)
		if w.Code != tc.status {
			t.Errorf("%s %s: got %d want %d", tc.method, tc.path, w.Code, tc.status)
		}
	}
	if len(store.items) != 1 {
		t.Fatal("invalid request changed data")
	}
}
