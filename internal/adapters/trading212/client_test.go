package trading212

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	"go.opentelemetry.io/otel/trace"
)

func TestAccountSummaryResponseUnmarshalCurrentPayload(t *testing.T) {
	var response AccountSummaryResponse
	err := json.Unmarshal([]byte(`{
		"cash": {
			"availableToTrade": 125.50,
			"inPies": 0,
			"reservedForOrders": 20
		},
		"currency": "GBP",
		"id": 42,
		"investments": {
			"currentValue": 374.50,
			"realizedProfitLoss": 4,
			"totalCost": 350,
			"unrealizedProfitLoss": 24.50
		},
		"totalValue": 500
	}`), &response)
	if err != nil {
		t.Fatalf("unmarshal account summary: %v", err)
	}

	if response.Cash != 125.50 {
		t.Errorf("Cash = %v, want 125.5", response.Cash)
	}
	if response.Balance != 374.50 {
		t.Errorf("Balance = %v, want 374.5", response.Balance)
	}
	if response.ProfitLoss != 24.50 {
		t.Errorf("ProfitLoss = %v, want 24.5", response.ProfitLoss)
	}
	if response.TotalValue != 500 || response.Currency != "GBP" {
		t.Errorf("total/currency = %v/%q, want 500/GBP", response.TotalValue, response.Currency)
	}
}

func TestAccountSummaryResponseUnmarshalLegacyFlatPayload(t *testing.T) {
	var response AccountSummaryResponse
	err := json.Unmarshal([]byte(`{
		"cash": 125.50,
		"balance": 374.50,
		"profitLoss": 24.50,
		"totalBalance": 500,
		"currency": "GBP"
	}`), &response)
	if err != nil {
		t.Fatalf("unmarshal legacy account summary: %v", err)
	}

	if response.Cash != 125.50 || response.Balance != 374.50 || response.ProfitLoss != 24.50 {
		t.Errorf("unexpected legacy values: %+v", response)
	}
	if response.TotalValue != 500 {
		t.Errorf("TotalValue = %v, want fallback totalBalance 500", response.TotalValue)
	}
}

func TestMapOpenPositionKeepsInstrumentPricesInQuoteCurrency(t *testing.T) {
	holding := mapOpenPosition(OpenPositionResponse{
		AveragePricePaid: 150,
		CurrentPrice:     168,
		Quantity:         10,
		Instrument:       &InstrumentResponse{Ticker: "GOOGL_US_EQ", Currency: "USD"},
		WalletImpact: &WalletImpactResponse{
			Currency:     "GBP",
			FxImpact:     47.25,
			TotalCost:    1_180,
			CurrentValue: 1_320,
		},
	})

	if holding.AveragePrice != 150 || holding.CurrentPrice != 168 {
		t.Fatalf("quote prices = %v/%v, want USD 150/168", holding.AveragePrice, holding.CurrentPrice)
	}
	if holding.CostBasis != 1_180 || holding.CurrentValue != 1_320 {
		t.Fatalf("wallet values = %v/%v, want GBP 1180/1320", holding.CostBasis, holding.CurrentValue)
	}
	if holding.Currency != "GBP" || holding.InstrumentCurrency != "USD" {
		t.Fatalf("currencies = %q/%q, want GBP/USD", holding.Currency, holding.InstrumentCurrency)
	}
	if holding.FXImpact != 47.25 {
		t.Fatalf("FXImpact = %v, want 47.25", holding.FXImpact)
	}
}

func TestClientLabelsOutboundBrokerSpan(t *testing.T) {
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/api/v0/equity/portfolio" {
			t.Fatalf("path = %q, want /api/v0/equity/portfolio", r.URL.Path)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`[]`)),
			Request:    r,
		}, nil
	})

	previousProvider := otel.GetTracerProvider()
	recorder := tracetest.NewSpanRecorder()
	provider := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	otel.SetTracerProvider(provider)
	t.Cleanup(func() {
		_ = provider.Shutdown(context.Background())
		otel.SetTracerProvider(previousProvider)
	})
	client := newClient("https://broker.test/api/v0", "api-key", "api-secret", transport)
	client.retryCount = 0
	if _, err := client.GetPortfolio(context.Background(), "account-id"); err != nil {
		t.Fatalf("GetPortfolio() error = %v", err)
	}

	if !spanHasAttribute(recorder.Ended(), "peer.service", "trading212-api") {
		t.Fatal("outbound broker client span is missing peer.service=trading212-api")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func spanHasAttribute(spans []sdktrace.ReadOnlySpan, key, want string) bool {
	for _, span := range spans {
		if span.SpanKind() != trace.SpanKindClient {
			continue
		}
		for _, item := range span.Attributes() {
			if item.Key == attribute.Key(key) && item.Value.AsString() == want {
				return true
			}
		}
	}
	return false
}
