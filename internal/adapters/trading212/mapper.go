package trading212

import "mosaic/internal/domain"

func mapOpenPosition(position OpenPositionResponse) domain.Holding {
	symbol := ""
	isin := ""
	name := ""
	if position.Instrument != nil {
		symbol = position.Instrument.Ticker
		isin = position.Instrument.ISIN
		name = position.Instrument.Name
	}

	currency := "GBP"
	instrumentCurrency := "GBP"
	if position.Instrument != nil {
		instrumentCurrency = position.Instrument.Currency
	}
	costBasis := position.Quantity * position.AveragePricePaid
	currentValue := position.Quantity * position.CurrentPrice
	avgPrice := position.AveragePricePaid
	curPrice := position.CurrentPrice
	fxImpact := 0.0

	if position.WalletImpact != nil {
		currency = position.WalletImpact.Currency
		costBasis = position.WalletImpact.TotalCost
		currentValue = position.WalletImpact.CurrentValue
		fxImpact = position.WalletImpact.FxImpact
	}
	// Trading 212 supplies AveragePricePaid and CurrentPrice in the instrument's
	// quote currency (for example USD for GOOGL). Wallet impact is in the
	// account/wallet currency (for example GBP). Keep these distinct: deriving
	// a per-share price from wallet values silently relabels a GBP value as USD.

	return domain.Holding{
		Symbol:             symbol,
		Ticker:             symbol,
		ISIN:               isin,
		Name:               name,
		Quantity:           position.Quantity,
		AveragePrice:       avgPrice,
		CurrentPrice:       curPrice,
		CostBasis:          costBasis,
		CurrentValue:       currentValue,
		FXImpact:           fxImpact,
		Currency:           currency,
		InstrumentCurrency: instrumentCurrency,
	}
}
