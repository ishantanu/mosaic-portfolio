import { useState, useEffect } from './react.js';

function buildFetchUrl(url, refreshKey) {
  if (!url || refreshKey <= 0) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}refresh=${refreshKey}`;
}

// Faro's TracingInstrumentation owns W3C trace propagation for /api requests.
// Do not generate a second traceparent here: doing so splits browser and API
// spans into different traces and prevents Grafana from correlating them.
function requestTraceHeaders() {
  return {
    'X-Mosaic-Client-Request-ID': window.crypto.randomUUID(),
  };
}

/**
 * Generic data-fetching hook.
 *
 * @param {string|null} url  - endpoint to fetch; pass null to skip
 * @param {number} refreshKey - increment this value externally to trigger a re-fetch
 * @returns {{ data, loading, error }}
 */
export function useApi(url, refreshKey = 0) {
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);

  useEffect(() => {
    if (!url) return;

    let cancelled = false;
    const controller = new AbortController();
    const fetchUrl = buildFetchUrl(url, refreshKey);

    setLoading(true);
    setError(null);

    fetch(fetchUrl, { signal: controller.signal, headers: requestTraceHeaders() })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.text().catch(() => res.statusText);
          throw new Error(`${res.status}: ${body}`);
        }
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (cancelled || err.name === 'AbortError') return;
        setError(err.message || 'Unknown error');
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, refreshKey]);

  return { data, loading, error };
}
