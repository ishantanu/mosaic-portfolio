package application

import (
	"bytes"
	"encoding/csv"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"mosaic/internal/domain"
)

func csvFixture() domain.Portfolio {
	return domain.Portfolio{LastSynced: time.Date(2026, 9, 14, 12, 0, 0, 123, time.UTC), Holdings: []domain.Holding{{Broker: "Broker", AccountID: "account", Symbol: "TEST", Ticker: "TEST", ISIN: "GB0000000000", Name: "Fund, \"quoted\"\nsecond line", Quantity: 1.23456789, AveragePrice: 12.2, CurrentPrice: 13.5, CostBasis: 15.1, CurrentValue: 16.7, TER: .19, OCF: .21, FXImpact: -2.5, Currency: "GBP", InstrumentCurrency: "USD"}}}
}

func TestCSVRoundTrip(t *testing.T) {
	for _, name := range []string{"Fund, \"quoted\"\nsecond line", "CR\rtext\r\nline", "'mosaic64:literal", "=HYPERLINK(\"bad\")", " +formula", "@formula", "-formula", "'literal", "普通の株式"} {
		t.Run(name, func(t *testing.T) {
			original := csvFixture()
			original.Holdings[0].Name = name
			data, err := ExportPortfolioCSV(original)
			if err != nil {
				t.Fatal(err)
			}
			parsed, err := ParsePortfolioCSV(data)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(original.Holdings, parsed.Holdings) || !original.LastSynced.Truncate(time.Microsecond).Equal(parsed.SnapshotAt) {
				t.Fatalf("round trip changed data: %#v", parsed)
			}
			if csvText(name) != name && !bytes.Contains(data, []byte("'")) {
				t.Fatal("missing formula protection")
			}
		})
	}
}

func TestCSVValidation(t *testing.T) {
	data, _ := ExportPortfolioCSV(csvFixture())
	for _, tc := range []struct {
		name   string
		column string
		value  string
	}{
		{"version", "mosaic_version", "2"}, {"date", "snapshot_at", "yesterday"}, {"missing broker", "broker", ""},
		{"NaN", "quantity", "NaN"}, {"infinity", "current_value", "+Inf"}, {"negative", "quantity", "-1"},
		{"currency", "currency", "gbp"}, {"empty number", "cost_basis", ""}, {"huge text", "name", strings.Repeat("x", 513)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rows, _ := csv.NewReader(bytes.NewReader(data)).ReadAll()
			for i, c := range rows[0] {
				if c == tc.column {
					rows[1][i] = tc.value
				}
			}
			var b bytes.Buffer
			w := csv.NewWriter(&b)
			_ = w.WriteAll(rows)
			if _, err := ParsePortfolioCSV(b.Bytes()); err == nil {
				t.Fatal("accepted invalid CSV")
			}
		})
	}
	for _, invalid := range [][]byte{nil, []byte("a,b\n1,2"), bytes.Repeat([]byte("a"), MaxCSVBytes+1), {255}, []byte(strings.Join(csvColumns, ",") + "\n")} {
		if _, err := ParsePortfolioCSV(invalid); err == nil {
			t.Fatal("accepted invalid input")
		}
	}
	rows, _ := csv.NewReader(bytes.NewReader(data)).ReadAll()
	var b bytes.Buffer
	w := csv.NewWriter(&b)
	_ = w.WriteAll(append(rows, rows[1]))
	if _, err := ParsePortfolioCSV(b.Bytes()); err == nil {
		t.Fatal("accepted duplicate holding")
	}
}

func TestCSVCanonicalDuplicateID(t *testing.T) {
	p := csvFixture()
	second := p.Holdings[0]
	second.AccountID = "another"
	p.Holdings = append(p.Holdings, second)
	data, _ := ExportPortfolioCSV(p)
	first, _ := ParsePortfolioCSV(data)
	rows, _ := csv.NewReader(bytes.NewReader(data)).ReadAll()
	rows[1], rows[2] = rows[2], rows[1]
	for _, row := range rows {
		row[0], row[1] = row[1], row[0]
	}
	var b bytes.Buffer
	b.WriteString("\ufeff")
	w := csv.NewWriter(&b)
	_ = w.WriteAll(rows)
	secondImport, err := ParsePortfolioCSV(b.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != secondImport.ID {
		t.Fatal("equivalent files produce different IDs")
	}
}

func TestCSVRowLimitsAndConsistency(t *testing.T) {
	data, _ := ExportPortfolioCSV(csvFixture())
	rows, _ := csv.NewReader(bytes.NewReader(data)).ReadAll()
	for _, name := range []string{"mixed snapshots", "wrong field count", "duplicate header", "too many holdings"} {
		t.Run(name, func(t *testing.T) {
			header := append([]string(nil), rows[0]...)
			first := append([]string(nil), rows[1]...)
			second := append([]string(nil), rows[1]...)
			second[3] = "other-account"
			var out bytes.Buffer
			w := csv.NewWriter(&out)
			if name == "duplicate header" {
				header[0] = header[1]
			}
			_ = w.Write(header)
			_ = w.Write(first)
			switch name {
			case "mixed snapshots":
				second[1] = "2025-01-01T00:00:00Z"
				_ = w.Write(second)
			case "wrong field count":
				_ = w.Write(second[:3])
			case "too many holdings":
				// Compact rows keep this below the byte limit to exercise the row limit.
				for i := 0; i < MaxCSVHoldings; i++ {
					_ = w.Write([]string{"1", first[1], "B", strconv.Itoa(i), "T", "T", "", "", "1", "1", "1", "1", "1", "0", "0", "0", "GBP", "GBP"})
				}
			}
			w.Flush()
			if _, err := ParsePortfolioCSV(out.Bytes()); err == nil {
				t.Fatal("accepted invalid rows")
			}
		})
	}
}

func TestCSVDatabaseTimestampPrecision(t *testing.T) {
	p := csvFixture()
	p.LastSynced = time.Date(2026, 9, 14, 13, 48, 53, 670455458, time.UTC)
	data, err := ExportPortfolioCSV(p)
	if err != nil {
		t.Fatal(err)
	}
	first, err := ParsePortfolioCSV(data)
	if err != nil {
		t.Fatal(err)
	}
	// Simulate pgx/PostgreSQL's timestamp precision at the persistence boundary.
	stored := domain.Portfolio{Holdings: first.Holdings, LastSynced: first.SnapshotAt.Truncate(time.Microsecond)}
	reExport, err := ExportPortfolioCSV(stored)
	if err != nil {
		t.Fatal(err)
	}
	second, err := ParsePortfolioCSV(reExport)
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID || !bytes.Equal(data, reExport) {
		t.Fatal("database round trip changed CSV identity")
	}
}
