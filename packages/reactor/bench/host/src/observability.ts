// Bootstrap the OpenTelemetry meter provider and pin the global instance
// before any reactor module calls metrics.getMeter(). Imported as the very
// first side-effecting module in main.ts.
import { metrics } from "@opentelemetry/api";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { Resource } from "@opentelemetry/resources";
import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const PROM_PORT = parseInt(process.env.PROM_PORT ?? "9090", 10);
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? "reactor-bench";
const WORKERS = process.env.REACTOR_WORKERS ?? "0";

const exporter = new PrometheusExporter(
  {
    port: PROM_PORT,
    endpoint: "/metrics",
  },
  () => {
    console.log(
      `[bench-host] Prometheus metrics on :${PROM_PORT}/metrics (workers=${WORKERS})`,
    );
  },
);

const provider = new MeterProvider({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    "reactor.workers": WORKERS,
  }),
  readers: [exporter],
});

metrics.setGlobalMeterProvider(provider);

export { provider };
