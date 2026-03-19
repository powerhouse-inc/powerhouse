import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { Resource } from "@opentelemetry/resources";
import {
    MeterProvider,
    PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { childLogger } from "document-model";

const logger = childLogger(["switchboard", "metrics"]);

export function createMeterProviderFromEnv(env: {
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_METRIC_EXPORT_INTERVAL?: string;
  OTEL_SERVICE_NAME?: string;
}): MeterProvider | undefined {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return undefined;

  const parsed = parseInt(env.OTEL_METRIC_EXPORT_INTERVAL ?? "", 10);
  const exportIntervalMillis =
    Number.isFinite(parsed) && parsed > 0 ? parsed : 5_000;

  const base = endpoint.replace(/\/$/, "");
  const exporterUrl = base.endsWith("/v1/metrics")
    ? base
    : `${base}/v1/metrics`;

  logger.info(`Initializing OpenTelemetry metrics exporter at: ${endpoint}`);
  const meterProvider = new MeterProvider({
    resource: new Resource({
      "service.name": env.OTEL_SERVICE_NAME ?? "switchboard",
    }),
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: exporterUrl,
        }),
        exportIntervalMillis,
        exportTimeoutMillis: Math.max(exportIntervalMillis - 250, 1),
      }),
    ],
  });
  logger.info(`Metrics export enabled (interval: ${exportIntervalMillis}ms)`);
  return meterProvider;
}
