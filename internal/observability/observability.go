// Package observability configures tracing without making a collector mandatory.
package observability

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	metricexporter "go.opentelemetry.io/otel/exporters/prometheus"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.37.0"
)

// Setup installs W3C propagation in every environment. Traces are exported only
// when an OTLP endpoint is configured, so local development needs no collector.
func Setup(ctx context.Context, logger *slog.Logger) (func(context.Context) error, error) {
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{}, propagation.Baggage{},
	))
	metricsExporter, err := metricexporter.New()
	if err != nil {
		return nil, fmt.Errorf("create Prometheus exporter: %w", err)
	}
	metricsProvider := sdkmetric.NewMeterProvider(sdkmetric.WithReader(metricsExporter))
	otel.SetMeterProvider(metricsProvider)

	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
	if endpoint == "" {
		endpoint = os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	}
	if endpoint == "" {
		logger.Info("observability_configured", slog.Bool("tracing_enabled", false))
		return metricsProvider.Shutdown, nil
	}

	serviceName := os.Getenv("OTEL_SERVICE_NAME")
	if serviceName == "" {
		serviceName = "mosaic-api"
	}
	res, err := resource.Merge(resource.Default(), resource.NewSchemaless(
		semconv.ServiceName(serviceName),
		semconv.ServiceVersion("0.1.0"),
	))
	if err != nil {
		return nil, fmt.Errorf("create telemetry resource: %w", err)
	}
	exporter, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, fmt.Errorf("create OTLP trace exporter: %w", err)
	}
	sampleRatio := 1.0
	if configured := os.Getenv("OTEL_TRACES_SAMPLER_ARG"); configured != "" {
		parsed, parseErr := strconv.ParseFloat(configured, 64)
		if parseErr != nil || parsed < 0 || parsed > 1 {
			return nil, fmt.Errorf("OTEL_TRACES_SAMPLER_ARG must be between 0 and 1")
		}
		sampleRatio = parsed
	}
	provider := trace.NewTracerProvider(
		trace.WithBatcher(exporter),
		trace.WithResource(res),
		trace.WithSampler(trace.ParentBased(trace.TraceIDRatioBased(sampleRatio))),
	)
	otel.SetTracerProvider(provider)
	logger.Info("observability_configured", slog.Bool("tracing_enabled", true), slog.String("otlp_endpoint", endpoint), slog.Float64("sample_ratio", sampleRatio))
	return func(shutdownCtx context.Context) error {
		_ = metricsProvider.Shutdown(shutdownCtx)
		return provider.Shutdown(shutdownCtx)
	}, nil
}
