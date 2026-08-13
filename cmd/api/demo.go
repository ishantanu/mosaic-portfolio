package main

import (
	"time"

	"mosaic/internal/domain"
)

// demoFixture is deliberately fictional. It lets someone explore every view
// without exposing credentials, account identifiers, or real portfolio values.
type demoFixture struct {
	summary      domain.AccountSummary
	portfolio    domain.Portfolio
	positions    []domain.Holding
	orders       map[string]any
	transactions map[string]any
	dividends    map[string]any
}

func newDemoFixture(accountID string) demoFixture {
	now := time.Now().UTC()
	holdings := []domain.Holding{
		{Broker: "Trading 212", AccountID: "demo-t212-isa", Ticker: "VWRP", Symbol: "VWRP", ISIN: "IE00BK5BQT80", Name: "Vanguard FTSE All-World UCITS ETF", Quantity: 38.4, AveragePrice: 103.20, CurrentPrice: 111.75, CostBasis: 3962.88, CurrentValue: 4291.20, TER: 0.19, Currency: "GBP", InstrumentCurrency: "GBP"},
		{Broker: "Interactive Brokers", AccountID: "demo-ibkr-isa", Ticker: "GOOGL", Symbol: "GOOGL", ISIN: "US02079K3059", Name: "Alphabet Inc Class A", Quantity: 9, AveragePrice: 146.80, CurrentPrice: 168.10, CostBasis: 1321.20, CurrentValue: 1512.90, Currency: "GBP", InstrumentCurrency: "USD"},
		{Broker: "Trading 212", AccountID: "demo-t212-isa", Ticker: "SGLN", Symbol: "SGLN", ISIN: "IE00B579F325", Name: "iShares Physical Gold ETC", Quantity: 52, AveragePrice: 36.10, CurrentPrice: 39.35, CostBasis: 1877.20, CurrentValue: 2046.20, TER: 0.12, Currency: "GBP", InstrumentCurrency: "USD"},
		{Broker: "Interactive Brokers", AccountID: "demo-ibkr-isa", Ticker: "MSFT", Symbol: "MSFT", ISIN: "US5949181045", Name: "Microsoft Corporation", Quantity: 5, AveragePrice: 316.40, CurrentPrice: 340.70, CostBasis: 1582.00, CurrentValue: 1703.50, Currency: "GBP", InstrumentCurrency: "USD"},
	}
	orders := []map[string]any{
		{"ticker": "VWRP", "name": "Vanguard FTSE All-World UCITS ETF", "side": "BUY", "type": "MARKET", "status": "FILLED", "quantity": 5.4, "price": 111.75, "filledValue": 603.45, "createdAt": now.AddDate(0, 0, -3).Format(time.RFC3339), "filledAt": now.AddDate(0, 0, -3).Format(time.RFC3339), "currency": "GBP", "instrument": map[string]any{"ticker": "VWRP", "currency": "GBP"}},
		{"ticker": "GOOGL", "name": "Alphabet Inc Class A", "side": "BUY", "type": "MARKET", "status": "FILLED", "quantity": 2, "price": 168.10, "filledValue": 336.20, "createdAt": now.AddDate(0, 0, -12).Format(time.RFC3339), "filledAt": now.AddDate(0, 0, -12).Format(time.RFC3339), "currency": "USD", "instrument": map[string]any{"ticker": "GOOGL", "currency": "USD"}},
		{"ticker": "SGLN", "name": "iShares Physical Gold ETC", "side": "BUY", "type": "MARKET", "status": "FILLED", "quantity": 12, "price": 39.35, "filledValue": 472.20, "createdAt": now.AddDate(0, -1, -4).Format(time.RFC3339), "filledAt": now.AddDate(0, -1, -4).Format(time.RFC3339), "currency": "GBP", "instrument": map[string]any{"ticker": "SGLN", "currency": "GBP"}},
	}
	transactions := []map[string]any{
		{"type": "DEPOSIT", "amount": 3000.00, "dateTime": now.AddDate(0, -5, 0).Format(time.RFC3339)},
		{"type": "DEPOSIT", "amount": 2500.00, "dateTime": now.AddDate(0, -3, 0).Format(time.RFC3339)},
		{"type": "DEPOSIT", "amount": 1500.00, "dateTime": now.AddDate(0, -1, -10).Format(time.RFC3339)},
	}
	return demoFixture{
		summary:      domain.AccountSummary{AccountID: accountID, Broker: "Mosaic Demo", ConnectedBrokers: []string{"Trading 212", "Interactive Brokers"}, Balance: 9803.80, Cash: 250.00, ProfitLoss: 2803.80, TotalValue: 9803.80, Currency: "GBP", LastSynced: now},
		portfolio:    domain.Portfolio{ID: "mosaic-demo", AccountID: accountID, Broker: "Mosaic Demo · 2 linked ISA accounts", Holdings: holdings, LastSynced: now},
		positions:    holdings,
		orders:       map[string]any{"items": orders},
		transactions: map[string]any{"items": transactions},
		dividends: map[string]any{"items": []map[string]any{
			{"ticker": "VWRP", "name": "Vanguard FTSE All-World UCITS ETF", "amount": 18.72, "currency": "GBP", "paidOn": now.AddDate(0, -1, -18).Format(time.RFC3339)},
			{"ticker": "MSFT", "name": "Microsoft Corporation", "amount": 3.16, "currency": "GBP", "paidOn": now.AddDate(0, -2, -5).Format(time.RFC3339)},
		}},
	}
}
