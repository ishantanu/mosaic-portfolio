package trading212

import (
	"context"
	"time"

	"mosaic/internal/domain"
)

type Connector struct {
	client *Client
}

func NewConnector(
	client *Client,
) *Connector {

	return &Connector{
		client: client,
	}

}

func (c *Connector) Name() string {

	return "TRADING212"

}

func (c *Connector) GetPortfolio(
	ctx context.Context,
	accountID string,
) (*domain.Portfolio, error) {
	positions, err := c.client.GetOpenPositions(ctx, accountID, "")
	if err != nil {
		return nil, err
	}

	holdings := make([]domain.Holding, 0, len(positions))
	for _, position := range positions {
		holding := mapOpenPosition(position)
		holding.Broker = c.Name()
		holding.AccountID = accountID
		holdings = append(holdings, holding)
	}

	return &domain.Portfolio{
		AccountID:  accountID,
		Broker:     c.Name(),
		Holdings:   holdings,
		LastSynced: time.Now(),
	}, nil

}

func (c *Connector) GetAccountSummary(
	ctx context.Context,
	accountID string,
) (*domain.AccountSummary, error) {
	response, err := c.client.GetAccountSummary(ctx, accountID)
	if err != nil {
		return nil, err
	}

	return &domain.AccountSummary{
		AccountID:        accountID,
		Broker:           c.Name(),
		ConnectedBrokers: []string{c.Name()},
		Balance:          response.Balance,
		Cash:             response.Cash,
		ProfitLoss:       response.ProfitLoss,
		TotalValue:       response.TotalValue,
		Currency:         response.Currency,
		LastSynced:       time.Now(),
	}, nil
}
