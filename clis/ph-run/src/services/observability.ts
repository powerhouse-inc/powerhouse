// The switchboard bin imports its observability module before anything else,
// so OpenTelemetry's require-time hooks patch http/express/pg/graphql as they
// load. `ph run` does the same before it loads a host.

import type * as ObservabilityModule from "@powerhousedao/switchboard/observability";

type Observability = typeof ObservabilityModule;

// What the module reads to pick a destination. With none of them set it only
// starts idle SDKs, so it is not loaded: a run without observability pays
// nothing.
const DESTINATION_ENV = [
  "SENTRY_DSN",
  "TEMPO_ENDPOINT",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
] as const;

export function observabilityConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return DESTINATION_ENV.some((name) => Boolean(env[name]?.trim()));
}

/**
 * Loads the switchboard's observability module when the env names a
 * destination. The module initializes at load and the module cache keeps it
 * to once per process, so every caller gets the same instance.
 */
export async function loadObservability(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Observability | undefined> {
  if (!observabilityConfigured(env)) return undefined;
  return import("@powerhousedao/switchboard/observability");
}
