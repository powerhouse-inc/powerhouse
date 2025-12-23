/**
 * Datadog APM Tracing Module
 *
 * This module provides Datadog tracing, profiling, and logging integration.
 * Tracing is enabled when DD_TRACE_ENABLED=true or DD_ENV is set.
 *
 * Environment Variables (aligned with vetra-cloud ECS configuration):
 * - DD_TRACE_ENABLED: Enable tracing (default: "false"). Set to "true" to enable.
 * - DD_ENV: Environment name (e.g., "production", "staging"). Also enables tracing if set.
 * - DD_SERVICE: Service name (default: "reactor-api")
 * - DD_VERSION: Service version (default: "1.0.0" or reads from package.json)
 * - DD_AGENT_HOST: Datadog agent host (default: "localhost")
 * - DD_TRACE_AGENT_PORT: Datadog trace agent port (default: 8126)
 * - DD_DOGSTATSD_PORT: DogStatsD port for metrics (default: 8125)
 * - DD_SITE: Datadog site (default: "datadoghq.com")
 * - DD_PROFILING_ENABLED: Enable continuous profiling (default: "true" when tracing enabled)
 * - DD_LOGS_INJECTION: Enable log correlation (default: "true" when tracing enabled)
 * - DD_RUNTIME_METRICS_ENABLED: Enable runtime metrics (default: "true")
 */

import type { Tracer, Span, SpanOptions } from "dd-trace";

let tracer: Tracer | null = null;
let isInitialized = false;

/**
 * Check if Datadog tracing should be enabled based on environment variables.
 * Tracing is enabled when DD_TRACE_ENABLED=true or DD_ENV is set.
 */
export function isTracingEnabled(): boolean {
  return process.env.DD_TRACE_ENABLED === "true" || !!process.env.DD_ENV;
}

/**
 * Initialize Datadog tracing.
 * This should be called as early as possible in the application lifecycle,
 * ideally before any other imports.
 *
 * @returns The initialized tracer instance, or null if tracing is disabled.
 */
export async function initTracing(): Promise<Tracer | null> {
  if (isInitialized) {
    return tracer;
  }

  isInitialized = true;

  if (!isTracingEnabled()) {
    return null;
  }

  const ddTrace = await import("dd-trace");

  // Get version - default to "1.0.0" per vetra-cloud config, or read from package.json
  let version = process.env.DD_VERSION;
  if (!version) {
    try {
      const { readPackage } = await import("read-pkg");
      const pkg = await readPackage();
      version = pkg.version ?? "1.0.0";
    } catch {
      version = "1.0.0";
    }
  }

  const serviceName = process.env.DD_SERVICE ?? "reactor-api";
  const env = process.env.DD_ENV ?? "development";
  const hostname = process.env.DD_AGENT_HOST ?? "localhost";
  const port = parseInt(process.env.DD_TRACE_AGENT_PORT ?? "8126", 10);
  const dogstatsdPort = parseInt(process.env.DD_DOGSTATSD_PORT ?? "8125", 10);

  // Initialize the tracer with vetra-cloud aligned configuration
  tracer = ddTrace.default.init({
    service: serviceName,
    env,
    version,
    hostname,
    port,
    dogstatsd: {
      hostname,
      port: dogstatsdPort,
    },
    logInjection: process.env.DD_LOGS_INJECTION !== "false",
    runtimeMetrics: process.env.DD_RUNTIME_METRICS_ENABLED !== "false",
    profiling: process.env.DD_PROFILING_ENABLED !== "false",
    // Enable common integrations
    plugins: true,
    // Tags for better categorization
    tags: {
      "dd.source": "nodejs",
    },
  });

  // Enable profiling if not explicitly disabled
  if (process.env.DD_PROFILING_ENABLED !== "false") {
    try {
      // @ts-expect-error - dd-trace/profiling doesn't have type declarations
      const { profiler } = await import("dd-trace/profiling");
      profiler.start();
    } catch (err) {
      console.warn("[tracing] Failed to start profiler:", err);
    }
  }

  console.info(
    `[tracing] Datadog tracing initialized: service=${serviceName}, env=${env}, version=${version}, agent=${hostname}:${port}`,
  );

  return tracer;
}

/**
 * Get the current tracer instance.
 * Returns null if tracing is not initialized or disabled.
 */
export function getTracer(): Tracer | null {
  return tracer;
}

/**
 * Create a new span for tracing a specific operation.
 * If tracing is disabled, this returns a no-op wrapper.
 *
 * @param name - The name of the operation
 * @param options - Optional span options
 * @param fn - The function to trace
 * @returns The result of the function
 */
export async function trace<T>(
  name: string,
  options: SpanOptions,
  fn: (span?: Span) => Promise<T>,
): Promise<T> {
  if (!tracer) {
    return fn(undefined);
  }

  return tracer.trace(name, options, fn);
}

/**
 * Synchronous version of trace.
 */
export function traceSync<T>(
  name: string,
  options: SpanOptions,
  fn: (span?: Span) => T,
): T {
  if (!tracer) {
    return fn(undefined);
  }

  return tracer.trace(name, options, fn);
}

/**
 * Add tags to the current active span.
 */
export function addTags(tags: Record<string, string | number | boolean>): void {
  if (!tracer) {
    return;
  }

  const span = tracer.scope().active();
  if (span) {
    span.addTags(tags);
  }
}

/**
 * Set an error on the current active span.
 */
export function setError(error: Error): void {
  if (!tracer) {
    return;
  }

  const span = tracer.scope().active();
  if (span) {
    span.setTag("error", true);
    span.setTag("error.message", error.message);
    span.setTag("error.stack", error.stack ?? "");
  }
}

/**
 * Get trace context for log correlation.
 * Returns trace_id and span_id for the current active span.
 */
export function getTraceContext(): {
  trace_id?: string;
  span_id?: string;
  service?: string;
  env?: string;
} {
  if (!tracer) {
    return {};
  }

  const span = tracer.scope().active();
  if (!span) {
    return {
      service: process.env.DD_SERVICE ?? "reactor-api",
      env: process.env.DD_ENV,
    };
  }

  const context = span.context();
  return {
    trace_id: context.toTraceId(),
    span_id: context.toSpanId(),
    service: process.env.DD_SERVICE ?? "reactor-api",
    env: process.env.DD_ENV,
  };
}

/**
 * Log levels for structured logging
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Structured log entry with Datadog trace correlation.
 * Format aligned with Datadog log ingestion via FireLens/Fluent Bit.
 */
export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  // Datadog standard fields (prefixed with dd)
  ddsource: string;
  ddtags: string;
  service: string;
  env?: string;
  version?: string;
  // Trace correlation
  dd?: {
    trace_id?: string;
    span_id?: string;
  };
  [key: string]: unknown;
}

/**
 * Create a structured log entry with trace correlation.
 * This format is compatible with Datadog log ingestion via FireLens.
 */
export function createStructuredLog(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
): StructuredLog {
  const traceContext = getTraceContext();
  const service = process.env.DD_SERVICE ?? "reactor-api";
  const env = process.env.DD_ENV ?? "development";
  const version = process.env.DD_VERSION ?? "1.0.0";
  const projectName = process.env.PH_PROJECT_NAME ?? "powerhouse";

  const log: StructuredLog = {
    timestamp: new Date().toISOString(),
    level,
    message,
    // Datadog standard fields for log processing
    ddsource: "nodejs",
    ddtags: `env:${env},project:${projectName},version:${version}`,
    service,
    env,
    version,
    ...data,
  };

  // Add trace correlation if available
  if (traceContext.trace_id || traceContext.span_id) {
    log.dd = {
      trace_id: traceContext.trace_id,
      span_id: traceContext.span_id,
    };
  }

  return log;
}

/**
 * Logger that outputs structured JSON logs compatible with Datadog.
 * When tracing is disabled, falls back to simple console logging.
 */
export const structuredLogger = {
  debug(message: string, data?: Record<string, unknown>): void {
    if (isTracingEnabled()) {
      console.log(JSON.stringify(createStructuredLog("debug", message, data)));
    } else {
      console.debug(message, data ?? "");
    }
  },

  info(message: string, data?: Record<string, unknown>): void {
    if (isTracingEnabled()) {
      console.log(JSON.stringify(createStructuredLog("info", message, data)));
    } else {
      console.info(message, data ?? "");
    }
  },

  warn(message: string, data?: Record<string, unknown>): void {
    if (isTracingEnabled()) {
      console.log(JSON.stringify(createStructuredLog("warn", message, data)));
    } else {
      console.warn(message, data ?? "");
    }
  },

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorData: Record<string, unknown> = { ...data };

    if (error instanceof Error) {
      errorData.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error !== undefined) {
      errorData.error = error;
    }

    if (isTracingEnabled()) {
      console.log(JSON.stringify(createStructuredLog("error", message, errorData)));
    } else {
      console.error(message, error ?? "", data ?? "");
    }
  },
};

// Re-export types for convenience
export type { Tracer, Span, SpanOptions } from "dd-trace";
