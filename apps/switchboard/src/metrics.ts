import { metrics } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";

export function initMetricsFromEnv(
  env: typeof process.env,
): MeterProvider | undefined {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return undefined;

  console.log(`Initializing OpenTelemetry metrics exporter at: ${endpoint}`);
  const meterProvider = new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${endpoint}/v1/metrics`,
        }),
        exportIntervalMillis: 5_000,
      }),
    ],
  });
  // setGlobalMeterProvider is a one-way door — it cannot be unset once
  // assigned. ReactorInstrumentation reads the global provider via
  // metrics.getMeter(), so this must be called before instrumentation.start().
  metrics.setGlobalMeterProvider(meterProvider);
  console.log("  Metrics export enabled (interval: 5s)");
  return meterProvider;
}
