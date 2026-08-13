import { getWebInstrumentations, initializeFaro } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

const url = import.meta.env.VITE_FARO_URL;

// Faro is opt-in. Never add portfolio values, account identifiers, API payloads,
// or broker credentials as Faro attributes or custom events.
if (url) {
  initializeFaro({
    url,
    app: { name: 'mosaic-web', version: import.meta.env.VITE_APP_VERSION ?? 'dev' },
    instrumentations: [
      ...getWebInstrumentations(),
      new TracingInstrumentation({
        resourceAttributes: {
          'service.name': 'mosaic-web',
        },
        instrumentationOptions: { propagateTraceHeaderCorsUrls: [/\/api\//] },
      }),
    ],
  });
}
