// OpenTelemetry Tracing Configuration for Reactor API
// This file must be loaded before the application starts

import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
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

  // Initialize OpenTelemetry SDK
  const sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    instrumentations: [
      getNodeAutoInstrumentations({
        // Automatically instrument common libraries
        "@opentelemetry/instrumentation-http": {
          enabled: true,
          ignoreIncomingRequestHook: (req) => {
            // Don't trace health check endpoints
            return req.url === "/health" || req.url === "/ready";
          },
          // Enable peer service name detection for service graphs
          requireParentforIncomingSpans: false,
          requireParentforOutgoingSpans: false,
          // Add http.target to spans for better observability
          requestHook: (span, request) => {
            // Add custom attributes for service graph
            span.setAttribute(
              "http.route",
              (request as IncomingMessage).url || "",
            );
          },
          responseHook: (span, response) => {
            // Add response attributes
            if (response.statusCode) {
              span.setAttribute("http.status_code", response.statusCode);
            }
          },
        },
        "@opentelemetry/instrumentation-express": {
          enabled: true,
          // Add route information to spans
          requestHook: (span, info) => {
            if (info.route) {
              span.setAttribute("http.route", info.route);
            }
          },
        },
        "@opentelemetry/instrumentation-graphql": {
          enabled: true,
          // Add GraphQL operation details for service graphs
          mergeItems: true,
          allowValues: true,
        },
        "@opentelemetry/instrumentation-pg": {
          enabled: true,
          // Add database peer service for service graphs
          enhancedDatabaseReporting: true,
        },
        "@opentelemetry/instrumentation-redis-4": {
          enabled: true,
          // Add Redis peer service for service graphs
          dbStatementSerializer: (cmdName, cmdArgs) => {
            return cmdName;
          },
        },
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
  console.log(
    "OpenTelemetry tracing disabled (set ENABLE_TRACING=true to enable)",
  );
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
