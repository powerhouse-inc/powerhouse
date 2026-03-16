import { metrics } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { Resource } from "@opentelemetry/resources";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { childLogger } from "document-drive";

const logger = childLogger(["switchboard", "metrics"]);

export function setupMetricsFromEnv(
  env: typeof process.env,
): MeterProvider | undefined {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return undefined;

  const parsed = parseInt(env.OTEL_METRIC_EXPORT_INTERVAL ?? "", 10);
  const exportIntervalMillis =
    Number.isFinite(parsed) && parsed > 0 ? parsed : 5_000;

  logger.info(`Initializing OpenTelemetry metrics exporter at: ${endpoint}`);
  const meterProvider = new MeterProvider({
    resource: new Resource({
      "service.name": env.OTEL_SERVICE_NAME ?? "switchboard",
    }),
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${endpoint.replace(/\/$/, "")}/v1/metrics`,
        }),
        exportIntervalMillis,
      }),
    ],
  });
  // setGlobalMeterProvider is a one-way door — it cannot be unset once
  // assigned. ReactorInstrumentation reads the global provider via
  // metrics.getMeter(), so this must be called before instrumentation.start().
  metrics.setGlobalMeterProvider(meterProvider);
  logger.info(`Metrics export enabled (interval: ${exportIntervalMillis}ms)`);
  return meterProvider;
}
