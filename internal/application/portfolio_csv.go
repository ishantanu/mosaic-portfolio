package application

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"mosaic/internal/domain"
)

const MaxCSVBytes = 2 * 1024 * 1024
const MaxCSVHoldings = 10000

var csvColumns = []string{"mosaic_version", "snapshot_at", "broker", "account_id", "symbol", "ticker", "isin", "name", "quantity", "average_price", "current_price", "cost_basis", "current_value", "ter", "ocf", "fx_impact", "currency", "instrument_currency"}

type ImportedPortfolio struct {
	ID         string           `json:"id"`
	ImportedAt time.Time        `json:"importedAt"`
	SnapshotAt time.Time        `json:"snapshotAt"`
	Holdings   []domain.Holding `json:"holdings"`
}

// Prefix potentially executable spreadsheet cells, including an existing prefix,
// so exports are safe to open and the Mosaic reader can reverse this losslessly.
func csvText(s string) string {
	// encoding/csv normalizes CRLF and its writer can drop carriage returns.
	// Preserve these uncommon text values explicitly instead of losing data.
	if strings.ContainsRune(s, '\r') {
		return "'mosaic64:" + base64.StdEncoding.EncodeToString([]byte(s))
	}
	t := strings.TrimLeftFunc(s, unicode.IsSpace)
	if strings.HasPrefix(s, "'") || (len(t) > 0 && strings.ContainsRune("=+-@", rune(t[0]))) || strings.ContainsAny(s, "\t\r\n") {
		return "'" + s
	}
	return s
}

func ExportPortfolioCSV(p domain.Portfolio) ([]byte, error) {
	if len(p.Holdings) == 0 {
		return nil, fmt.Errorf("no holdings available to export")
	}
	var out bytes.Buffer
	w := csv.NewWriter(&out)
	w.UseCRLF = true
	_ = w.Write(csvColumns)
	for _, h := range p.Holdings {
		if h.Broker == "" {
			h.Broker = p.Broker
		}
		if h.AccountID == "" {
			h.AccountID = p.AccountID
		}
		n := func(v float64) string { return strconv.FormatFloat(v, 'g', -1, 64) }
		_ = w.Write([]string{"1", p.LastSynced.UTC().Truncate(time.Microsecond).Format(time.RFC3339Nano), csvText(h.Broker), csvText(h.AccountID), csvText(h.Symbol), csvText(h.Ticker), csvText(h.ISIN), csvText(h.Name), n(h.Quantity), n(h.AveragePrice), n(h.CurrentPrice), n(h.CostBasis), n(h.CurrentValue), n(h.TER), n(h.OCF), n(h.FXImpact), h.Currency, h.InstrumentCurrency})
	}
	w.Flush()
	if w.Error() != nil {
		return nil, w.Error()
	}
	// Never produce a download which this importer cannot restore.
	if _, err := ParsePortfolioCSV(out.Bytes()); err != nil {
		return nil, fmt.Errorf("portfolio cannot be exported: %w", err)
	}
	return out.Bytes(), nil
}

func ParsePortfolioCSV(data []byte) (*ImportedPortfolio, error) {
	if len(data) > MaxCSVBytes {
		return nil, fmt.Errorf("CSV must be 2 MiB or smaller")
	}
	if !utf8.Valid(data) {
		return nil, fmt.Errorf("CSV must use UTF-8 encoding")
	}
	r := csv.NewReader(strings.NewReader(strings.TrimPrefix(string(data), "\ufeff")))
	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("could not read CSV header")
	}
	if len(header) != len(csvColumns) {
		return nil, fmt.Errorf("use a Mosaic holdings CSV export; expected %d columns", len(csvColumns))
	}
	index := map[string]int{}
	for i, name := range header {
		if _, exists := index[name]; exists {
			return nil, fmt.Errorf("duplicate column %q", name)
		}
		index[name] = i
	}
	for _, name := range csvColumns {
		if _, ok := index[name]; !ok {
			return nil, fmt.Errorf("missing column %q", name)
		}
	}
	p := &ImportedPortfolio{Holdings: []domain.Holding{}}
	seen := map[string]bool{}
	for row := 2; ; row++ {
		record, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("row %d: invalid CSV structure", row)
		}
		if len(p.Holdings) >= MaxCSVHoldings {
			return nil, fmt.Errorf("CSV exceeds %d holdings", MaxCSVHoldings)
		}
		get := func(k string) string { return record[index[k]] }
		if get("mosaic_version") != "1" {
			return nil, fmt.Errorf("row %d: unsupported Mosaic CSV version", row)
		}
		at, err := time.Parse(time.RFC3339Nano, get("snapshot_at"))
		if err != nil || at.IsZero() {
			return nil, fmt.Errorf("row %d: invalid snapshot_at timestamp", row)
		}
		// PostgreSQL timestamps retain microseconds. Canonicalize before hashing
		// so storing and re-exporting a snapshot cannot change its duplicate ID.
		at = at.Truncate(time.Microsecond)
		if len(p.Holdings) == 0 {
			p.SnapshotAt = at.UTC()
		} else if !at.Equal(p.SnapshotAt) {
			return nil, fmt.Errorf("row %d: all rows must belong to the same snapshot", row)
		}
		h := domain.Holding{}
		for key, ptr := range map[string]*string{"broker": &h.Broker, "account_id": &h.AccountID, "symbol": &h.Symbol, "ticker": &h.Ticker, "isin": &h.ISIN, "name": &h.Name, "currency": &h.Currency, "instrument_currency": &h.InstrumentCurrency} {
			*ptr = strings.TrimPrefix(get(key), "'")
			if encoded, ok := strings.CutPrefix(get(key), "'mosaic64:"); ok {
				decoded, err := base64.StdEncoding.DecodeString(encoded)
				if err != nil || !utf8.Valid(decoded) {
					return nil, fmt.Errorf("row %d: invalid escaped %s text", row, key)
				}
				*ptr = string(decoded)
			}
			if len(*ptr) > 512 || strings.ContainsRune(*ptr, 0) {
				return nil, fmt.Errorf("row %d: invalid %s text", row, key)
			}
		}
		if strings.TrimSpace(h.Broker) == "" || strings.TrimSpace(h.AccountID) == "" || strings.TrimSpace(h.Ticker) == "" {
			return nil, fmt.Errorf("row %d: broker, account_id and ticker are required", row)
		}
		for _, c := range []string{h.Currency, h.InstrumentCurrency} {
			if len(c) != 3 || strings.IndexFunc(c, func(r rune) bool { return r < 'A' || r > 'Z' }) >= 0 {
				return nil, fmt.Errorf("row %d: currencies must be three uppercase letters", row)
			}
		}
		for key, ptr := range map[string]*float64{"quantity": &h.Quantity, "average_price": &h.AveragePrice, "current_price": &h.CurrentPrice, "cost_basis": &h.CostBasis, "current_value": &h.CurrentValue, "ter": &h.TER, "ocf": &h.OCF, "fx_impact": &h.FXImpact} {
			v, err := strconv.ParseFloat(get(key), 64)
			if err != nil || math.IsNaN(v) || math.IsInf(v, 0) || (v < 0 && key != "fx_impact") {
				return nil, fmt.Errorf("row %d: invalid %s number", row, key)
			}
			*ptr = v
		}
		identity, _ := json.Marshal([]string{h.Broker, h.AccountID, h.Ticker})
		if seen[string(identity)] {
			return nil, fmt.Errorf("row %d: duplicate broker/account/ticker holding", row)
		}
		seen[string(identity)] = true
		p.Holdings = append(p.Holdings, h)
	}
	if len(p.Holdings) == 0 {
		return nil, fmt.Errorf("CSV contains no holdings")
	}
	// Stable across reordered rows, quoting, line endings, and column ordering.
	sort.Slice(p.Holdings, func(i, j int) bool {
		a, _ := json.Marshal([]string{p.Holdings[i].Broker, p.Holdings[i].AccountID, p.Holdings[i].Ticker})
		b, _ := json.Marshal([]string{p.Holdings[j].Broker, p.Holdings[j].AccountID, p.Holdings[j].Ticker})
		return string(a) < string(b)
	})
	canonical, _ := json.Marshal(p)
	sum := sha256.Sum256(canonical)
	p.ID = hex.EncodeToString(sum[:])
	return p, nil
}
