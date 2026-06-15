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
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
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

// Whether to forward TRANSACTIONS (spans) to Sentry. Errors are always sent
// when SENTRY_DSN is set — this flag only gates APM/tracing into Sentry.
// Default on (back-compat). Set SENTRY_TRACING_ENABLED=false for an
// "errors-only" deployment: errors still go to Sentry, traces still go to
// Tempo, but no transactions hit Sentry (no Kafka/ClickHouse/nodestore
// cost). This is the recommended mode for tenant workloads at scale —
// Sentry's value there is error grouping; traces live in Tempo.
const SENTRY_TRACING_TO_SENTRY =
  Boolean(SENTRY_DSN) && process.env.SENTRY_TRACING_ENABLED !== "false";

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

// APM sampling for the Sentry-SDK-managed path (i.e. when TRACING is OFF and
// @sentry/node runs its own bundled OTel — see skipOpenTelemetrySetup below).
//
// IMPORTANT: when TRACING_ENABLED, this value does NOT govern span volume.
// Our NodeSDK (below) owns the pipeline and is constructed with no explicit
// `sampler`, so @opentelemetry/sdk-node falls back to buildSamplerFromEnv()
// and the REAL head-sampling knob is the standard OTEL_TRACES_SAMPLER /
// OTEL_TRACES_SAMPLER_ARG env (set per-deploy in the k8s chart). That head
// decision gates spans before any processor runs, so it bounds BOTH the
// SentrySpanProcessor (→ Sentry transactions) and the Tempo OTLP export.
// (Wiring @sentry/opentelemetry's SentrySampler here would let this rate
// drive both backends and make DSC/sample_rand propagation spec-correct, but
// that only matters for Sentry server-side dynamic sampling — a SaaS feature
// our self-hosted install doesn't run — so it's intentionally deferred.)
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
    // 0 in errors-only mode so even @sentry/node's bundled auto-OTel path
    // (used when TRACING_ENABLED is false) produces no transactions.
    tracesSampleRate: SENTRY_TRACING_TO_SENTRY ? SENTRY_TRACES_SAMPLE_RATE : 0,
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
  if (SENTRY_TRACING_TO_SENTRY) {
    // Fan the same OTel spans into Sentry — same trace IDs as Tempo, so
    // Sentry transactions cross-link to traces in Grafana. Skipped in
    // errors-only mode (SENTRY_TRACING_ENABLED=false): spans still flow to
    // Tempo via the BatchSpanProcessor above, just not to Sentry.
    spanProcessors.push(new SentrySpanProcessor());
  }

  sdk = new NodeSDK({
    resource,
    spanProcessors,
    textMapPropagator: SENTRY_TRACING_TO_SENTRY
      ? new SentryPropagator()
      : undefined,
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
      // HttpInstrumentation only patches node:http/https; outbound global
      // fetch() goes through undici and is otherwise untraced — e.g. the
      // per-request Renown credential check in AuthService.verifyCredentialExists.
      new UndiciInstrumentation(),
      new GraphQLInstrumentation({ mergeItems: true, allowValues: true }),
      // requireParentSpan: only trace DB queries that run inside a request
      // (HTTP/GraphQL) span. Parentless queries — the management
      // switchboard's background polling loops (vetra-cloud-observability
      // reconcile @60s + clint pull-worker @15s, each writing
      // environment_pods / clint_runtime_endpoints) — would otherwise each
      // become a standalone root transaction. That volume scales O(tenant
      // count) and was ~70% of all Sentry transactions before this change.
      // Dropping it at the instrumentation layer (no span created at all) is
      // cheaper and cleaner than sampling it away downstream.
      new PgInstrumentation({
        enhancedDatabaseReporting: true,
        requireParentSpan: true,
      }),
    ],
  });
  sdk.start();
  if (
    SENTRY_TRACING_TO_SENTRY &&
    typeof Sentry.validateOpenTelemetrySetup === "function"
  ) {
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
