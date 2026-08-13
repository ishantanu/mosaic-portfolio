package application

import (
	"context"
	"time"
)

// PortfolioValueSnapshot is a broker-valued point in time. Values are stored
// in the account's base currency and are never reconstructed from a third-party
// market-data feed.
type PortfolioValueSnapshot struct {
	At         time.Time `json:"at"`
	TotalValue float64   `json:"totalValue"`
	Cash       float64   `json:"cash"`
	Currency   string    `json:"currency"`
}

// PortfolioHistory is the persistence boundary used by the HTTP API. Keeping
// it here allows the application layer to remain independent of Postgres.
type PortfolioHistory interface {
	Record(context.Context, string, PortfolioValueSnapshot) error
	List(context.Context, string) ([]PortfolioValueSnapshot, error)
	Ping(context.Context) error
	Close()
}
