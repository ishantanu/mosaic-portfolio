package domain

type Holding struct {
	// Broker and AccountID make a position source-addressable. They are required
	// when several brokers hold the same instrument, so clients must never use a
	// ticker alone as a row identity.
	Broker             string  `json:"broker"`
	AccountID          string  `json:"accountId"`
	Symbol             string  `json:"symbol"`
	Ticker             string  `json:"ticker"`
	ISIN               string  `json:"isin"`
	Name               string  `json:"name"`
	Quantity           float64 `json:"quantity"`
	AveragePrice       float64 `json:"averagePrice"`
	CurrentPrice       float64 `json:"currentPrice"`
	CostBasis          float64 `json:"costBasis"`
	CurrentValue       float64 `json:"currentValue"`
	TER                float64 `json:"ter,omitempty"`
	OCF                float64 `json:"ocf,omitempty"`
	// FXImpact is the broker-reported contribution of currency movements to the
	// open position. It is an investment result, not an FX conversion charge.
	FXImpact            float64 `json:"fxImpact"`
	Currency           string  `json:"currency"`
	InstrumentCurrency string  `json:"instrumentCurrency"`
}
