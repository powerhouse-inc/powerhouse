// Single observability bootstrap: Sentry + OpenTelemetry (tracing + metrics).
//
// MUST be imported as the very first module in apps/switchboard/src/index.mts.
// OpenTelemetry instrumentations register require-time hooks at module load,
// so http/express/pg/graphql must not be imported (transitively) before this
// file runs.
//
// Replaces three legacy bootstrap sites:
// - apps/switchboard/src/server.mts top-level Sentry.init
// - apps/switchboard/src/metrics.ts standalone MeterProvider (still exported
//   here via createMeterProviderFromEnv so its tests keep passing)
// - packages/reactor-api/src/tracing.ts side-effect NodeSDK
import { metrics } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { MeterProvider } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import * as Sentry from "@sentry/node";
import { SentryPropagator, SentrySpanProcessor } from "@sentry/opentelemetry";
import { childLogger } from "document-model";
import type { IncomingMessage } from "node:http";
import { createMeterProviderFromEnv } from "./metrics.js";

const logger = childLogger(["switchboard", "observability"]);

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "switchboard";
const SERVICE_VERSION = process.env.npm_package_version || "unknown";
const TENANT_ID = process.env.TENANT_ID || "default";
const DEPLOY_ENV = process.env.NODE_ENV || "development";

const TEMPO_ENDPOINT = process.env.TEMPO_ENDPOINT;
const SENTRY_DSN = process.env.SENTRY_DSN;

const TRACING_REQUESTED =
  process.env.ENABLE_TRACING === "true" ||
  process.env.NODE_ENV === "production";
const HAS_TRACE_DESTINATION = Boolean(TEMPO_ENDPOINT) || Boolean(SENTRY_DSN);
const TRACING_ENABLED = TRACING_REQUESTED && HAS_TRACE_DESTINATION;

if (TRACING_REQUESTED && !HAS_TRACE_DESTINATION) {
  logger.warn(
    "Tracing was requested (NODE_ENV=production or ENABLE_TRACING=true) but " +
      "no destination is configured — instrumentation will not run. Set " +
      "TEMPO_ENDPOINT (e.g. http://tempo.monitoring.svc.cluster.local:4318/v1/traces) " +
      "to export OTLP spans, and/or SENTRY_DSN to forward spans to Sentry.",
  );
}

// Default 10% APM sampling — Sentry's own production guidance; overridable
// per-deploy. Only kicks in once tracesSampleRate * (sampler decision) lands.
const SENTRY_TRACES_SAMPLE_RATE = parseFloat(
  process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1",
);

if (SENTRY_DSN) {
  logger.info("Initialized Sentry with env: @env", process.env.SENTRY_ENV);
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.SENTRY_ENV,
    // Match the version tag uploaded by release-branch.yml so source maps
    // resolve. Populated by the CI (WORKSPACE_VERSION) or npm at runtime.
    release:
      process.env.SENTRY_RELEASE ||
      (process.env.npm_package_version
        ? `v${process.env.npm_package_version}`
        : undefined),
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    // When tracing is on, our NodeSDK below owns the OTel globals and Sentry
    // receives spans via SentrySpanProcessor. Skipping Sentry's bundled OTel
    // setup avoids two TracerProviders fighting over setGlobalTracerProvider.
    // When tracing is off, leave the flag unset so @sentry/node's default
    // auto-OTel still records HTTP transactions for the APM dashboard.
    skipOpenTelemetrySetup: TRACING_ENABLED,
  });
}

const meterProvider: MeterProvider | undefined = createMeterProviderFromEnv({
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  OTEL_METRIC_EXPORT_INTERVAL: process.env.OTEL_METRIC_EXPORT_INTERVAL,
  OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
});
if (meterProvider) {
  // One-way door: must register before any code calls metrics.getMeter() —
  // most notably ReactorInstrumentation inside the reactor module.
  metrics.setGlobalMeterProvider(meterProvider);
}

let sdk: NodeSDK | undefined;

if (TRACING_ENABLED) {
  logger.info(`Initializing OpenTelemetry tracing for ${SERVICE_NAME}`);
  if (TEMPO_ENDPOINT) logger.info(`  Tempo endpoint: ${TEMPO_ENDPOINT}`);
  if (SENTRY_DSN) logger.info(`  Sentry span forwarding: enabled`);
  logger.info(`  Tenant: ${TENANT_ID}`);

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    "tenant.id": TENANT_ID,
    "deployment.environment": DEPLOY_ENV,
  });

  const spanProcessors: SpanProcessor[] = [];
  if (TEMPO_ENDPOINT) {
    spanProcessors.push(
      new BatchSpanProcessor(new OTLPTraceExporter({ url: TEMPO_ENDPOINT })),
    );
  }
  if (SENTRY_DSN) {
    // Fan the same OTel spans into Sentry — same trace IDs as Tempo, so
    // Sentry transactions cross-link to traces in Grafana.
    spanProcessors.push(new SentrySpanProcessor());
  }

  sdk = new NodeSDK({
    resource,
    spanProcessors,
    textMapPropagator: SENTRY_DSN ? new SentryPropagator() : undefined,
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) =>
          req.url === "/health" || req.url === "/ready",
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
          if (info.route) span.setAttribute("http.route", info.route);
        },
      }),
      new GraphQLInstrumentation({ mergeItems: true, allowValues: true }),
      new PgInstrumentation({ enhancedDatabaseReporting: true }),
    ],
  });
  sdk.start();
  if (SENTRY_DSN && typeof Sentry.validateOpenTelemetrySetup === "function") {
    Sentry.validateOpenTelemetrySetup();
  }
  logger.info("OpenTelemetry tracing initialized");
}

async function shutdown() {
  await Promise.race([
    Promise.all([
      meterProvider?.shutdown().catch(() => undefined),
      sdk?.shutdown().catch(() => undefined),
    ]),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

export { meterProvider, sdk };
