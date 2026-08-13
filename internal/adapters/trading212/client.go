package trading212

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

type PositionResponse struct {
	Ticker       string  `json:"ticker"`
	Quantity     float64 `json:"quantity"`
	AveragePrice float64 `json:"averagePrice"`
	CurrentPrice float64 `json:"currentPrice"`
}

type PortfolioResponse struct {
	Positions []PositionResponse `json:"positions"`
}

func (r *PortfolioResponse) UnmarshalJSON(data []byte) error {
	var wrapped struct {
		Positions []PositionResponse `json:"positions"`
		Data      []PositionResponse `json:"data"`
	}

	if err := json.Unmarshal(data, &wrapped); err == nil {
		if len(wrapped.Positions) > 0 {
			r.Positions = wrapped.Positions
			return nil
		}

		if len(wrapped.Data) > 0 {
			r.Positions = wrapped.Data
			return nil
		}
	}

	var list []PositionResponse
	if err := json.Unmarshal(data, &list); err == nil {
		r.Positions = list
		return nil
	}

	return fmt.Errorf("unexpected portfolio payload")
}

type CashResponse struct {
	AvailableCash float64 `json:"availableCash"`
	Cash          float64 `json:"cash"`
	Balance       float64 `json:"balance"`
	Currency      string  `json:"currency"`
}

type InstrumentResponse struct {
	ID        string `json:"id"`
	Ticker    string `json:"ticker"`
	Name      string `json:"name"`
	Currency  string `json:"currency"`
	ISIN      string `json:"isin"`
	Type      string `json:"type"`
	Exchange  string `json:"exchange"`
	Country   string `json:"country"`
	Precision int    `json:"precision"`
}

type WalletImpactResponse struct {
	Currency             string  `json:"currency"`
	CurrentValue         float64 `json:"currentValue"`
	FxImpact             float64 `json:"fxImpact"`
	TotalCost            float64 `json:"totalCost"`
	UnrealizedProfitLoss float64 `json:"unrealizedProfitLoss"`
}

type OpenPositionResponse struct {
	AveragePricePaid            float64               `json:"averagePricePaid"`
	CreatedAt                   time.Time             `json:"createdAt"`
	CurrentPrice                float64               `json:"currentPrice"`
	Instrument                  *InstrumentResponse   `json:"instrument"`
	Quantity                    float64               `json:"quantity"`
	QuantityAvailableForTrading float64               `json:"quantityAvailableForTrading"`
	QuantityInPies              float64               `json:"quantityInPies"`
	WalletImpact                *WalletImpactResponse `json:"walletImpact"`
}

type OrderResponse struct {
	CreatedAt      time.Time           `json:"createdAt"`
	Currency       string              `json:"currency"`
	ExtendedHours  bool                `json:"extendedHours"`
	FilledQuantity float64             `json:"filledQuantity"`
	FilledValue    float64             `json:"filledValue"`
	ID             int64               `json:"id"`
	InitiatedFrom  string              `json:"initiatedFrom"`
	Instrument     *InstrumentResponse `json:"instrument"`
	LimitPrice     float64             `json:"limitPrice"`
	Quantity       float64             `json:"quantity"`
	Side           string              `json:"side"`
	Status         string              `json:"status"`
	StopPrice      float64             `json:"stopPrice"`
	Strategy       string              `json:"strategy"`
	Ticker         string              `json:"ticker"`
	TimeInForce    string              `json:"timeInForce"`
	Type           string              `json:"type"`
	Value          float64             `json:"value"`
}

type FillResponse struct {
	FilledAt      time.Time `json:"filledAt"`
	ID            int64     `json:"id"`
	Price         float64   `json:"price"`
	Quantity      float64   `json:"quantity"`
	TradingMethod string    `json:"tradingMethod"`
	Type          string    `json:"type"`
}

type HistoricalOrder struct {
	Fill  *FillResponse  `json:"fill"`
	Order *OrderResponse `json:"order"`
}

type OrdersHistoryResponse struct {
	Items        []HistoricalOrder `json:"items"`
	NextPagePath string            `json:"nextPagePath"`
}

type DividendResponse struct {
	Amount              float64             `json:"amount"`
	AmountInEuro        float64             `json:"amountInEuro"`
	Currency            string              `json:"currency"`
	GrossAmountPerShare float64             `json:"grossAmountPerShare"`
	Instrument          *InstrumentResponse `json:"instrument"`
	PaidOn              time.Time           `json:"paidOn"`
	Quantity            float64             `json:"quantity"`
	Reference           string              `json:"reference"`
	Ticker              string              `json:"ticker"`
	TickerCurrency      string              `json:"tickerCurrency"`
	Type                string              `json:"type"`
}

type DividendsResponse struct {
	Items        []DividendResponse `json:"items"`
	NextPagePath string             `json:"nextPagePath"`
}

type TransactionResponse struct {
	Amount    float64   `json:"amount"`
	Currency  string    `json:"currency"`
	DateTime  time.Time `json:"dateTime"`
	Reference string    `json:"reference"`
	Type      string    `json:"type"`
}

type TransactionsHistoryResponse struct {
	Items        []TransactionResponse `json:"items"`
	NextPagePath string                `json:"nextPagePath"`
}

type ExportDataIncluded struct {
	IncludeDividends    bool `json:"includeDividends"`
	IncludeInterest     bool `json:"includeInterest"`
	IncludeOrders       bool `json:"includeOrders"`
	IncludeTransactions bool `json:"includeTransactions"`
}

type CreateExportRequest struct {
	DataIncluded ExportDataIncluded `json:"dataIncluded"`
	TimeFrom     time.Time          `json:"timeFrom"`
	TimeTo       time.Time          `json:"timeTo"`
}

type ExportReportResponse struct {
	ReportID     int64              `json:"reportId"`
	Status       string             `json:"status"`
	DownloadLink string             `json:"downloadLink"`
	TimeFrom     time.Time          `json:"timeFrom"`
	TimeTo       time.Time          `json:"timeTo"`
	DataIncluded ExportDataIncluded `json:"dataIncluded"`
}

type AccountSummaryResponse struct {
	Cash         float64 `json:"cash"`
	Balance      float64 `json:"balance"`
	TotalValue   float64 `json:"totalValue"`
	TotalBalance float64 `json:"totalBalance"`
	ProfitLoss   float64 `json:"profitLoss"`
	Currency     string  `json:"currency"`
}

func (r *AccountSummaryResponse) UnmarshalJSON(data []byte) error {
	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		return err
	}

	// The current Trading 212 account-summary endpoint returns cash and
	// investments as nested objects. Keep the flat-field fallbacks so clients
	// using an older broker payload continue to work.
	r.Cash = toFloat64(payload["cash"])
	r.Balance = toFloat64(payload["balance"])
	r.TotalValue = toFloat64(payload["totalValue"])
	r.TotalBalance = toFloat64(payload["totalBalance"])
	r.ProfitLoss = toFloat64(payload["profitLoss"])

	if cash, ok := payload["cash"].(map[string]any); ok {
		// This is the portion of cash that the customer can immediately invest.
		r.Cash = toFloat64(cash["availableToTrade"])
	}

	if investments, ok := payload["investments"].(map[string]any); ok {
		// currentValue is the market value of open holdings, which is what the
		// product presents as the invested balance.
		r.Balance = toFloat64(investments["currentValue"])
		r.ProfitLoss = toFloat64(investments["unrealizedProfitLoss"])
	}
	if value, ok := payload["currency"].(string); ok {
		r.Currency = value
	}

	if r.TotalValue == 0 && r.TotalBalance != 0 {
		r.TotalValue = r.TotalBalance
	}

	return nil
}

type RateLimitInfo struct {
	Limit      int
	Remaining  int
	ResetAt    time.Time
	ResetAfter time.Duration
}

type QueryOptions struct {
	Cursor string
	Ticker string
	Limit  int
}

type Client struct {
	baseURL    string
	apiKey     string
	apiSecret  string
	httpClient *http.Client
	logger     *slog.Logger
	tracer     trace.Tracer
	limiter    *rateLimiter
	retryCount int
	retryDelay time.Duration
}

type rateLimiter struct {
	interval time.Duration
	last     time.Time
	mu       sync.Mutex
}

func newRateLimiter(requestsPerSecond int) *rateLimiter {
	if requestsPerSecond < 1 {
		requestsPerSecond = 1
	}

	return &rateLimiter{
		interval: time.Second / time.Duration(requestsPerSecond),
	}
}

func (r *rateLimiter) Wait(ctx context.Context) error {
	r.mu.Lock()
	if r.last.IsZero() || time.Since(r.last) >= r.interval {
		r.last = time.Now()
		r.mu.Unlock()
		return nil
	}

	waitFor := r.interval - time.Since(r.last)
	r.mu.Unlock()

	timer := time.NewTimer(waitFor)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func NewClient(apiKey string, apiSecret string) *Client {
	baseURL := os.Getenv("TRADING212_BASE_URL")
	if baseURL == "" {
		baseURL = "https://live.trading212.com/api/v0"
	}
	return newClient(baseURL, apiKey, apiSecret, http.DefaultTransport)
}

func newClient(baseURL, apiKey, apiSecret string, transport http.RoundTripper) *Client {
	return &Client{
		baseURL:   baseURL,
		apiKey:    apiKey,
		apiSecret: apiSecret,
		httpClient: &http.Client{Timeout: 15 * time.Second, Transport: otelhttp.NewTransport(
			transport,
			otelhttp.WithSpanOptions(trace.WithAttributes(
				attribute.String("peer.service", "trading212-api"),
			)),
		)},
		logger: slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelInfo,
		})),
		tracer:     otel.Tracer("mosaic/internal/adapters/trading212"),
		limiter:    newRateLimiter(4),
		retryCount: 3,
		retryDelay: 250 * time.Millisecond,
	}
}

func (c *Client) GetPortfolio(ctx context.Context, accountID string) (*PortfolioResponse, error) {
	response := &PortfolioResponse{}
	if err := c.get(ctx, accountID, "/equity/portfolio", nil, response); err != nil {
		return nil, err
	}

	return response, nil
}

func (c *Client) GetAccountCash(ctx context.Context, accountID string) (*CashResponse, error) {
	response := &CashResponse{}
	if err := c.get(ctx, accountID, "/equity/account/cash", nil, response); err != nil {
		return nil, err
	}

	return response, nil
}

func (c *Client) GetAccountSummary(ctx context.Context, accountID string) (*AccountSummaryResponse, error) {
	response := &AccountSummaryResponse{}
	endpoint := "/equity/account/summary"
	if override := os.Getenv("TRADING212_ACCOUNT_SUMMARY_PATH"); override != "" {
		endpoint = override
	}
	if err := c.get(ctx, accountID, endpoint, nil, response); err != nil {
		return nil, err
	}

	return response, nil
}

func (c *Client) GetOrdersHistory(ctx context.Context, accountID string, options QueryOptions) (*OrdersHistoryResponse, error) {
	response := &OrdersHistoryResponse{}
	if options.Cursor == "" {
		options.Cursor = "0"
	}
	if options.Limit == 0 {
		options.Limit = 21
	}
	if err := c.get(ctx, accountID, "/equity/history/orders", buildQueryOptions(options), response); err != nil {
		return nil, err
	}

	return response, nil
}

func (c *Client) GetDividends(ctx context.Context, accountID string, options QueryOptions) (*DividendsResponse, error) {
	response := &DividendsResponse{}
	if options.Cursor == "" {
		options.Cursor = "0"
	}
	if options.Limit == 0 {
		options.Limit = 21
	}
	if err := c.get(ctx, accountID, "/equity/history/dividends", buildQueryOptions(options), response); err != nil {
		return nil, err
	}

	return response, nil
}

func (c *Client) GetExchangesMetadata(ctx context.Context, accountID string) ([]map[string]any, error) {
	response := make([]map[string]any, 0)
	if err := c.get(ctx, accountID, "/equity/metadata/exchanges", nil, &response); err != nil {
		return nil, err
	}

	return response, nil
}

func (c *Client) GetAllInstruments(ctx context.Context, accountID string) ([]map[string]any, error) {
	response := make([]map[string]any, 0)
	if err := c.get(ctx, accountID, "/equity/metadata/instruments", nil, &response); err != nil {
		return nil, err
	}

	return response, nil
}

func (c *Client) GetOpenPositions(ctx context.Context, accountID string, ticker string) ([]OpenPositionResponse, error) {
	response := make([]OpenPositionResponse, 0)
	options := QueryOptions{Ticker: ticker}
	if err := c.get(ctx, accountID, "/equity/positions", buildQueryOptions(options), &response); err != nil {
		return nil, err
	}

	return response, nil
}

func (c *Client) GetTransactionsHistory(ctx context.Context, accountID string, options QueryOptions) (*TransactionsHistoryResponse, error) {
	response := &TransactionsHistoryResponse{}
	if options.Cursor == "0" {
		options.Cursor = ""
	}
	if options.Limit == 0 {
		options.Limit = 21
	}
	if err := c.get(ctx, accountID, "/equity/history/transactions", buildQueryOptions(options), response); err != nil {
		return nil, err
	}

	return response, nil
}

// GetAllTransactionsHistory follows the broker cursor until the complete cash
// movement history has been retrieved. A money-weighted return is only correct
// when every dated deposit and withdrawal is included.
func (c *Client) GetAllTransactionsHistory(ctx context.Context, accountID string) (*TransactionsHistoryResponse, error) {
	all := &TransactionsHistoryResponse{Items: make([]TransactionResponse, 0)}
	options := QueryOptions{Limit: 50}

	for page := 0; page < 100; page++ {
		response, err := c.GetTransactionsHistory(ctx, accountID, options)
		if err != nil {
			return nil, err
		}
		all.Items = append(all.Items, response.Items...)
		if response.NextPagePath == "" {
			return all, nil
		}

		nextURL, err := url.Parse(response.NextPagePath)
		if err != nil {
			return all, nil
		}
		cursor := nextURL.Query().Get("cursor")
		if cursor == "" || cursor == options.Cursor {
			return all, nil
		}
		options.Cursor = cursor
	}

	return all, nil
}

func (c *Client) GetExportReports(ctx context.Context, accountID string) ([]ExportReportResponse, error) {
	response := make([]ExportReportResponse, 0)
	if err := c.get(ctx, accountID, "/equity/history/exports", nil, &response); err != nil {
		return nil, err
	}

	return response, nil
}

func (c *Client) CreateExportReport(ctx context.Context, accountID string, req CreateExportRequest) (*ExportReportResponse, error) {
	response := &ExportReportResponse{}
	if err := c.post(ctx, accountID, "/equity/history/exports", req, response); err != nil {
		return nil, err
	}

	return response, nil
}

func (c *Client) get(ctx context.Context, accountID string, endpoint string, queryParams url.Values, out interface{}) error {
	if c.apiKey == "" {
		return fmt.Errorf("trading212: missing API key")
	}
	if c.apiSecret == "" {
		return fmt.Errorf("trading212: missing API secret")
	}

	if ctx == nil {
		ctx = context.Background()
	}

	requestURL := c.buildURL(endpoint, accountID, queryParams)
	var lastErr error

	for attempt := 0; attempt <= c.retryCount; attempt++ {
		if err := c.limiter.Wait(ctx); err != nil {
			return err
		}

		ctxWithSpan, span := c.tracer.Start(ctx, strings.TrimPrefix(endpoint, "/"))
		span.SetAttributes(
			attribute.String("trading212.endpoint", endpoint),
		)

		request, err := http.NewRequestWithContext(ctxWithSpan, http.MethodGet, requestURL, nil)
		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			span.End()
			return err
		}

		request.Header.Set("Accept", "application/json")
		request.Header.Set("User-Agent", "mosaic/0.1")
		request.Header.Set("Authorization", "Basic "+basicAuthHeader(c.apiKey, c.apiSecret))

		start := time.Now()
		response, err := c.httpClient.Do(request)
		duration := time.Since(start)

		if err != nil {
			lastErr = err
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			span.End()
			c.logger.Error("trading212_request_failed", slog.String("endpoint", endpoint), slog.Duration("duration", duration), slog.String("error", err.Error()))
			if attempt == c.retryCount {
				return err
			}
			time.Sleep(c.retryDelay * time.Duration(attempt+1))
			continue
		}

		body, readErr := io.ReadAll(response.Body)
		_ = response.Body.Close()
		if readErr != nil {
			lastErr = readErr
			span.RecordError(readErr)
			span.SetStatus(codes.Error, readErr.Error())
			span.End()
			c.logger.Error("trading212_response_read_failed", slog.String("endpoint", endpoint), slog.Duration("duration", duration), slog.String("error", readErr.Error()))
			return readErr
		}

		statusOK := response.StatusCode >= http.StatusOK && response.StatusCode < http.StatusMultipleChoices
		if !statusOK && (response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= http.StatusInternalServerError) && attempt < c.retryCount {
			lastErr = fmt.Errorf("trading212: unexpected status code %d", response.StatusCode)
			span.RecordError(lastErr)
			span.SetStatus(codes.Error, lastErr.Error())
			span.End()
			c.logger.Warn("trading212_retryable_status", slog.String("endpoint", endpoint), slog.Int("status_code", response.StatusCode), slog.Duration("duration", duration))
			time.Sleep(c.retryDelay * time.Duration(attempt+1))
			continue
		}

		if !statusOK {
			lastErr = fmt.Errorf("trading212: unexpected status code %d, body: %s", response.StatusCode, strings.TrimSpace(string(body)))
			span.RecordError(lastErr)
			span.SetStatus(codes.Error, lastErr.Error())
			span.End()
			c.logger.Error("trading212_request_failed", slog.String("endpoint", endpoint), slog.Int("status_code", response.StatusCode), slog.Duration("duration", duration), slog.String("error", lastErr.Error()))
			return lastErr
		}

		if out != nil {
			if err := json.Unmarshal(body, out); err != nil {
				lastErr = fmt.Errorf("trading212: failed to decode response for %s: %w", endpoint, err)
				span.RecordError(lastErr)
				span.SetStatus(codes.Error, lastErr.Error())
				span.End()
				c.logger.Error("trading212_decode_failed", slog.String("endpoint", endpoint), slog.Duration("duration", duration), slog.String("error", lastErr.Error()))
				return lastErr
			}
		}

		rateLimit := parseRateLimitHeaders(response.Header)
		span.SetAttributes(
			attribute.Int("http.status_code", response.StatusCode),
			attribute.Int("http.response_bytes", len(body)),
			attribute.Int("trading212.rate_limit.limit", rateLimit.Limit),
			attribute.Int("trading212.rate_limit.remaining", rateLimit.Remaining),
			attribute.String("http.method", http.MethodGet),
			attribute.String("url.path", endpoint),
		)
		span.End()

		c.logger.Info("trading212_request_completed",
			slog.String("endpoint", endpoint),
			slog.Int("status_code", response.StatusCode),
			slog.Duration("duration", duration),
			slog.Int("rate_limit_limit", rateLimit.Limit),
			slog.Int("rate_limit_remaining", rateLimit.Remaining),
			slog.String("rate_limit_reset_at", rateLimit.ResetAt.Format(time.RFC3339)),
		)
		return nil
	}

	if lastErr != nil {
		return lastErr
	}

	return fmt.Errorf("trading212: request failed for %s", endpoint)
}

func (c *Client) post(ctx context.Context, accountID string, endpoint string, body interface{}, out interface{}) error {
	if c.apiKey == "" {
		return fmt.Errorf("trading212: missing API key")
	}
	if c.apiSecret == "" {
		return fmt.Errorf("trading212: missing API secret")
	}

	if ctx == nil {
		ctx = context.Background()
	}

	requestURL := c.buildURL(endpoint, accountID, nil)
	var reqBody io.Reader
	if body != nil {
		jsonBytes, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("trading212: failed to encode request body: %w", err)
		}
		reqBody = strings.NewReader(string(jsonBytes))
	}

	var lastErr error

	for attempt := 0; attempt <= c.retryCount; attempt++ {
		if err := c.limiter.Wait(ctx); err != nil {
			return err
		}

		ctxWithSpan, span := c.tracer.Start(ctx, strings.TrimPrefix(endpoint, "/"))
		span.SetAttributes(
			attribute.String("trading212.endpoint", endpoint),
		)

		request, err := http.NewRequestWithContext(ctxWithSpan, http.MethodPost, requestURL, reqBody)
		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			span.End()
			return err
		}

		request.Header.Set("Accept", "application/json")
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("User-Agent", "mosaic/0.1")
		request.Header.Set("Authorization", "Basic "+basicAuthHeader(c.apiKey, c.apiSecret))

		start := time.Now()
		response, err := c.httpClient.Do(request)
		duration := time.Since(start)

		if err != nil {
			lastErr = err
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			span.End()
			c.logger.Error("trading212_request_failed", slog.String("endpoint", endpoint), slog.Duration("duration", duration), slog.String("error", err.Error()))
			if attempt == c.retryCount {
				return err
			}
			time.Sleep(c.retryDelay * time.Duration(attempt+1))
			continue
		}

		respBody, readErr := io.ReadAll(response.Body)
		_ = response.Body.Close()
		if readErr != nil {
			lastErr = readErr
			span.RecordError(readErr)
			span.SetStatus(codes.Error, readErr.Error())
			span.End()
			c.logger.Error("trading212_response_read_failed", slog.String("endpoint", endpoint), slog.Duration("duration", duration), slog.String("error", readErr.Error()))
			return readErr
		}

		statusOK := response.StatusCode >= http.StatusOK && response.StatusCode < http.StatusMultipleChoices
		if !statusOK && (response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= http.StatusInternalServerError) && attempt < c.retryCount {
			lastErr = fmt.Errorf("trading212: unexpected status code %d", response.StatusCode)
			span.RecordError(lastErr)
			span.SetStatus(codes.Error, lastErr.Error())
			span.End()
			c.logger.Warn("trading212_retryable_status", slog.String("endpoint", endpoint), slog.Int("status_code", response.StatusCode), slog.Duration("duration", duration))
			time.Sleep(c.retryDelay * time.Duration(attempt+1))
			continue
		}

		if !statusOK {
			lastErr = fmt.Errorf("trading212: unexpected status code %d, body: %s", response.StatusCode, strings.TrimSpace(string(respBody)))
			span.RecordError(lastErr)
			span.SetStatus(codes.Error, lastErr.Error())
			span.End()
			c.logger.Error("trading212_request_failed", slog.String("endpoint", endpoint), slog.Int("status_code", response.StatusCode), slog.Duration("duration", duration), slog.String("error", lastErr.Error()))
			return lastErr
		}

		if out != nil && len(respBody) > 0 {
			if err := json.Unmarshal(respBody, out); err != nil {
				lastErr = fmt.Errorf("trading212: failed to decode response for %s: %w", endpoint, err)
				span.RecordError(lastErr)
				span.SetStatus(codes.Error, lastErr.Error())
				span.End()
				c.logger.Error("trading212_decode_failed", slog.String("endpoint", endpoint), slog.Duration("duration", duration), slog.String("error", lastErr.Error()))
				return lastErr
			}
		}

		rateLimit := parseRateLimitHeaders(response.Header)
		span.SetAttributes(
			attribute.Int("http.status_code", response.StatusCode),
			attribute.Int("http.response_bytes", len(respBody)),
			attribute.Int("trading212.rate_limit.limit", rateLimit.Limit),
			attribute.Int("trading212.rate_limit.remaining", rateLimit.Remaining),
			attribute.String("http.method", http.MethodPost),
			attribute.String("url.path", endpoint),
		)
		span.End()

		c.logger.Info("trading212_request_completed",
			slog.String("endpoint", endpoint),
			slog.Int("status_code", response.StatusCode),
			slog.Duration("duration", duration),
			slog.Int("rate_limit_limit", rateLimit.Limit),
			slog.Int("rate_limit_remaining", rateLimit.Remaining),
			slog.String("rate_limit_reset_at", rateLimit.ResetAt.Format(time.RFC3339)),
		)
		return nil
	}

	if lastErr != nil {
		return lastErr
	}

	return fmt.Errorf("trading212: request failed for %s", endpoint)
}

func basicAuthHeader(apiKey string, apiSecret string) string {
	credentials := apiKey + ":" + apiSecret
	encoded := base64.StdEncoding.EncodeToString([]byte(credentials))
	return encoded
}

func toFloat64(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case int32:
		return float64(typed)
	case string:
		parsed, err := strconv.ParseFloat(typed, 64)
		if err == nil {
			return parsed
		}
	}

	return 0
}

func parseRateLimitHeaders(header http.Header) RateLimitInfo {
	info := RateLimitInfo{}
	limitHeader := header.Get("X-RateLimit-Limit")
	remainingHeader := header.Get("X-RateLimit-Remaining")
	resetHeader := header.Get("X-RateLimit-Reset")

	if limitHeader != "" {
		if value, err := strconv.Atoi(limitHeader); err == nil {
			info.Limit = value
		}
	}
	if remainingHeader != "" {
		if value, err := strconv.Atoi(remainingHeader); err == nil {
			info.Remaining = value
		}
	}
	if resetHeader != "" {
		if value, err := strconv.ParseInt(resetHeader, 10, 64); err == nil {
			info.ResetAt = time.Unix(value, 0)
			info.ResetAfter = time.Until(info.ResetAt)
		}
	}

	return info
}

func buildQueryOptions(options QueryOptions) url.Values {
	query := url.Values{}
	if options.Cursor != "" {
		query.Set("cursor", options.Cursor)
	}
	if options.Ticker != "" {
		query.Set("ticker", options.Ticker)
	}
	if options.Limit > 0 {
		query.Set("limit", strconv.Itoa(options.Limit))
	}
	return query
}

func (c *Client) buildURL(endpoint string, accountID string, queryParams url.Values) string {
	base := strings.TrimRight(c.baseURL, "/") + endpoint
	requestURL, err := url.Parse(base)
	if err != nil {
		return base
	}

	query := requestURL.Query()
	if len(queryParams) > 0 {
		for key, values := range queryParams {
			for _, value := range values {
				query.Add(key, value)
			}
		}
	}
	if accountID != "" {
		query.Set("accountId", accountID)
	}
	requestURL.RawQuery = query.Encode()
	return requestURL.String()
}
