package domain

import "time"

type AccountSummary struct {
	AccountID        string    `json:"accountId"`
	Broker           string    `json:"broker"`
	ConnectedBrokers []string  `json:"connectedBrokers,omitempty"`
	Balance          float64   `json:"balance"`
	Cash             float64   `json:"cash"`
	ProfitLoss       float64   `json:"profitLoss"`
	TotalValue       float64   `json:"totalValue"`
	Currency         string    `json:"currency"`
	LastSynced       time.Time `json:"lastSynced"`
}
