// Ingress primitives kept out of the service so they can be tested directly.
import { timingSafeEqual } from "node:crypto";

export { hashToken } from "./trigger-supervisor.js";

// The mutation is reachable without authentication — the authorization service
// is consulted at document call sites, not as request middleware, and no
// resolver on this subgraph reads ctx.user. The delivery token is therefore
// the only credential, and this gate is the same one secret writes already
// carry: a deployment opts in rather than exposing an ingress it did not ask
// for.
export function webhookIngressEnabled(): boolean {
  if (process.env.PH_WEBHOOK_INGRESS === "false") return false;
  return (
    process.env.NODE_ENV === "development" ||
    process.env.PH_WEBHOOK_INGRESS === "true"
  );
}

// Compares two hex digests without leaking where they diverge. Both are
// SHA-256 hex, so a length mismatch means the stored value is not a digest at
// all — treated as no match rather than thrown.
export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.byteLength !== right.byteLength) return false;
  return timingSafeEqual(left, right);
}

// Fixed-window token bucket, one bucket per key. Deliberately in-memory: it
// bounds one process's exposure, and a restart forgetting the counters is
// preferable to a database write on every delivery.
export class TokenBucket {
  private readonly buckets = new Map<
    string,
    { count: number; windowStart: number }
  >();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  take(key: string): boolean {
    const at = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || at - bucket.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: at });
      return true;
    }
    if (bucket.count >= this.limit) return false;
    bucket.count += 1;
    return true;
  }
}

// The URL a provider posts deliveries to: this subgraph's GraphQL endpoint on
// the reactor's public origin. A trigger that needs one refuses to enable when
// it is unset, rather than registering an address nothing can reach.
export function webhookEndpointUrl(): string | undefined {
  const explicit = process.env.PH_WEBHOOK_ENDPOINT_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const origin = process.env.PH_PUBLIC_URL ?? process.env.PUBLIC_URL;
  if (!origin) return undefined;
  return `${origin.replace(/\/+$/, "")}/graphql/workflow-runtime`;
}
