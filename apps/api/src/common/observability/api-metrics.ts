const HTTP_STATUS_BUCKET = {
  S2XX: "2xx",
  S3XX: "3xx",
  S4XX: "4xx",
  S5XX: "5xx",
  OTHER: "other"
} as const;

type HttpStatusBucket = (typeof HTTP_STATUS_BUCKET)[keyof typeof HTTP_STATUS_BUCKET];

interface HttpMetricsState {
  requestsTotal: number;
  requestsByBucket: Record<HttpStatusBucket, number>;
  totalDurationMs: number;
  maxDurationMs: number;
}

const httpMetricsState: HttpMetricsState = {
  requestsTotal: 0,
  requestsByBucket: {
    [HTTP_STATUS_BUCKET.S2XX]: 0,
    [HTTP_STATUS_BUCKET.S3XX]: 0,
    [HTTP_STATUS_BUCKET.S4XX]: 0,
    [HTTP_STATUS_BUCKET.S5XX]: 0,
    [HTTP_STATUS_BUCKET.OTHER]: 0
  },
  totalDurationMs: 0,
  maxDurationMs: 0
};

export function recordHttpRequestMetric(statusCode: number, durationMs: number): void {
  const bucket = statusCode >= 200 && statusCode < 300
    ? HTTP_STATUS_BUCKET.S2XX
    : statusCode >= 300 && statusCode < 400
      ? HTTP_STATUS_BUCKET.S3XX
      : statusCode >= 400 && statusCode < 500
        ? HTTP_STATUS_BUCKET.S4XX
        : statusCode >= 500 && statusCode < 600
          ? HTTP_STATUS_BUCKET.S5XX
          : HTTP_STATUS_BUCKET.OTHER;

  httpMetricsState.requestsTotal += 1;
  httpMetricsState.requestsByBucket[bucket] += 1;
  httpMetricsState.totalDurationMs += durationMs;
  httpMetricsState.maxDurationMs = Math.max(httpMetricsState.maxDurationMs, durationMs);
}

export function getHttpMetricsSnapshot(): {
  requestsTotal: number;
  requestsByBucket: Record<HttpStatusBucket, number>;
  avgDurationMs: number;
  maxDurationMs: number;
} {
  return {
    requestsTotal: httpMetricsState.requestsTotal,
    requestsByBucket: { ...httpMetricsState.requestsByBucket },
    avgDurationMs: httpMetricsState.requestsTotal > 0
      ? Number((httpMetricsState.totalDurationMs / httpMetricsState.requestsTotal).toFixed(2))
      : 0,
    maxDurationMs: Number(httpMetricsState.maxDurationMs.toFixed(2))
  };
}

export function resetHttpMetrics(): void {
  httpMetricsState.requestsTotal = 0;
  httpMetricsState.requestsByBucket = {
    [HTTP_STATUS_BUCKET.S2XX]: 0,
    [HTTP_STATUS_BUCKET.S3XX]: 0,
    [HTTP_STATUS_BUCKET.S4XX]: 0,
    [HTTP_STATUS_BUCKET.S5XX]: 0,
    [HTTP_STATUS_BUCKET.OTHER]: 0
  };
  httpMetricsState.totalDurationMs = 0;
  httpMetricsState.maxDurationMs = 0;
}
