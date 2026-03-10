# @powerhousedao/opentelemetry-instrumentation-reactor

OpenTelemetry metrics instrumentation for `@powerhousedao/reactor`. This package inspects `ReactorModule` dependencies, and subscribes to reactor event bus events to register observable gauges for counters, histograms, and other metrics covering the job queue, executor, read model indexing, and sync subsystems.

This package only creates OTel instruments on the global meter. It does not configure exporters or collector endpoints -- that is the responsibility of the host application (see [Usage](#usage)).

For a full list of emitted metrics, attributes, and tracked event types, see [docs/taxonomy.md](docs/taxonomy.md).

## Install

```sh
pnpm add @powerhousedao/opentelemetry-instrumentation-reactor
```

Peer dependency: `@powerhousedao/reactor`

## Usage

```ts
import { ReactorInstrumentation } from "@powerhousedao/opentelemetry-instrumentation-reactor";

// `module` is the ReactorModule returned by ReactorBuilder
const instrumentation = new ReactorInstrumentation(module);
instrumentation.start();

// On shutdown:
instrumentation.stop();
```

`start()` subscribes to event bus events and registers observable gauge callbacks. `stop()` removes all subscriptions and clears internal state.

Metrics are recorded on the `@powerhousedao/reactor` meter via the global `@opentelemetry/api` `metrics.getMeter()`. To actually export them, configure a `MeterProvider` with an exporter in your application entry point. For example, using OTLP over HTTP:

```ts
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";

const sdk = new NodeSDK({
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: process.env.METRICS_ENDPOINT }),
    exportIntervalMillis: 60_000,
  }),
});

sdk.start();
```
