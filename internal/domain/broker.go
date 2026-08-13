package domain

import "context"

type BrokerConnector interface {
	Name() string

	GetPortfolio(
		ctx context.Context,
		accountID string,
	) (*Portfolio, error)

	GetAccountSummary(
		ctx context.Context,
		accountID string,
	) (*AccountSummary, error)
}
