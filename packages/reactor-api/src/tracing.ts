// OpenTelemetry Tracing Configuration for Reactor API
// This file must be loaded before the application starts

import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import type { IncomingMessage } from "http";

// Get configuration from environment
const TEMPO_ENDPOINT =
  process.env.TEMPO_ENDPOINT ||
  "http://tempo.monitoring.svc.cluster.local:4318/v1/traces";
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "reactor-api";
const SERVICE_VERSION = process.env.npm_package_version || "unknown";
const TENANT_ID = process.env.TENANT_ID || "default";
const METRICS_ENDPOINT = process.env.METRICS_ENDPOINT;
const METRICS_EXPORT_INTERVAL_MS = parseInt(
  process.env.METRICS_EXPORT_INTERVAL_MS || "30000",
  10,
);

// Only enable tracing if explicitly enabled or in production
const TRACING_ENABLED =
  process.env.ENABLE_TRACING === "true" ||
  process.env.NODE_ENV === "production";

if (TRACING_ENABLED) {
  console.log(`Initializing OpenTelemetry tracing for ${SERVICE_NAME}...`);
  console.log(`  Tempo endpoint: ${TEMPO_ENDPOINT}`);
  console.log(`  Service: ${SERVICE_NAME}`);
  console.log(`  Tenant: ${TENANT_ID}`);

  // Create OTLP trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: TEMPO_ENDPOINT,
    headers: {},
  });

  // Configure resource with service information
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    "tenant.id": TENANT_ID,
    "deployment.environment": process.env.NODE_ENV || "development",
  });

  // Prometheus pull exporter (opt-in: serves /metrics for Prometheus to scrape)
  const PROMETHEUS_METRICS_PORT = process.env.PROMETHEUS_METRICS_PORT;
  let metricReader:
    | PrometheusExporter
    | PeriodicExportingMetricReader
    | undefined;

  if (PROMETHEUS_METRICS_PORT) {
    const port = parseInt(PROMETHEUS_METRICS_PORT, 10);
    metricReader = new PrometheusExporter({ port, preventServerStart: false });
    console.log(`  Prometheus /metrics on port ${port}`);
  } else if (METRICS_ENDPOINT) {
    metricReader = new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: METRICS_ENDPOINT }),
      exportIntervalMillis: METRICS_EXPORT_INTERVAL_MS,
    });
    console.log(`  Metrics OTLP endpoint: ${METRICS_ENDPOINT}`);
    console.log(`  Metrics interval: ${METRICS_EXPORT_INTERVAL_MS}ms`);
  }

  // Initialize OpenTelemetry SDK
  const sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    metricReader,
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => {
          // Don't trace health check endpoints
          return req.url === "/health" || req.url === "/ready";
        },
        requireParentforIncomingSpans: false,
        requireParentforOutgoingSpans: false,
        requestHook: (span, request) => {
          span.setAttribute(
            "http.route",
            (request as IncomingMessage).url || "",
          );
        },
        responseHook: (span, response) => {
          if (response.statusCode) {
            span.setAttribute("http.status_code", response.statusCode);
          }
        },
      }),
      new ExpressInstrumentation({
        requestHook: (span, info) => {
          if (info.route) {
            span.setAttribute("http.route", info.route);
          }
        },
      }),
      new GraphQLInstrumentation({
        mergeItems: true,
        allowValues: true,
      }),
      new PgInstrumentation({
        enhancedDatabaseReporting: true,
      }),
    ],
  });

  // Start the SDK
  sdk.start();

  console.log("✓ OpenTelemetry tracing initialized");

  // Gracefully shutdown on exit
  process.on("SIGTERM", () => {
    sdk
      .shutdown()
      .then(() => console.log("Tracing terminated"))
      .catch((error) => console.log("Error terminating tracing", error))
      .finally(() => process.exit(0));
  });
} else {
  // console.debug(
  //   "OpenTelemetry tracing disabled (set ENABLE_TRACING=true to enable)",
  // );
}

// Stub exports for backwards compatibility during migration
// With OpenTelemetry auto-instrumentation, these are no longer needed
export async function initTracing() {
  // Tracing is initialized automatically when this module is imported
  return;
}

export function isTracingEnabled(): boolean {
  return TRACING_ENABLED;
}

// Simplified trace function - OpenTelemetry auto-instruments everything
// This is just a pass-through for backwards compatibility
export async function trace<T>(
  _name: string,
  _options: any,
  fn: () => Promise<T>,
): Promise<T> {
  return fn();
}
