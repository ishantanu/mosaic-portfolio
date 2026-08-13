package application

import (
	"context"

	"mosaic/internal/domain"
)

type PortfolioService struct {
	connector domain.BrokerConnector
}

func NewPortfolioService(
	connector domain.BrokerConnector,
) *PortfolioService {

	return &PortfolioService{
		connector: connector,
	}

}

func (s *PortfolioService) Sync(
	ctx context.Context,
	accountID string,
) (*domain.Portfolio, error) {

	return s.connector.GetPortfolio(
		ctx,
		accountID,
	)

}

func (s *PortfolioService) SyncAccountSummary(
	ctx context.Context,
	accountID string,
) (*domain.AccountSummary, error) {

	return s.connector.GetAccountSummary(
		ctx,
		accountID,
	)

}
