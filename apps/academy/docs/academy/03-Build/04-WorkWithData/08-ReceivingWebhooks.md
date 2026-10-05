# Receiving webhooks

A webhook endpoint is how a third-party provider (GitHub, Stripe, Slack, a payment gateway) delivers an event into your package. You register one endpoint family for the package, mint one endpoint per logical key, and hand the resulting URL to the provider. The reactor verifies signatures, absorbs redeliveries and answers the provider's probe before your code sees a delivery.

## Register once, mint per key

`register()` is called once per package, and it returns the endpoint family you mint from. The key is yours — a document id, an account id — and it never appears in the URL.

A subgraph registers from `onSetup`, off `this.http`:

```typescript
import { BaseSubgraph } from "@powerhousedao/reactor-api";
import type {
  IWebhookEndpoints,
  WebhookReply,
  WebhookRequest,
} from "@powerhousedao/reactor-api";

export class BillingSubgraph extends BaseSubgraph {
  name = "billing";

  #endpoints: IWebhookEndpoints | undefined;

  async onSetup(): Promise<void> {
    this.#endpoints = await this.http.webhooks.register({
      name: "invoices",
      onRequest: (request) => this.#deliver(request),
    });
  }

  // Reached once the delivery is deduped and is not a probe.
  async #deliver(request: WebhookRequest): Promise<WebhookReply> {
    await this.#recordEvent(request.key, request.body);
    return { status: 202 };
  }

  /** The URL to hand the provider. */
  async endpointUrl(documentId: string): Promise<string | undefined> {
    const endpoint = await this.#endpoints?.endpointFor(documentId);
    return endpoint?.url; // https://switchboard.example/webhooks/2f9c… (32 hex)
  }
}
```

Nothing here verifies a signature, so this endpoint accepts any caller that knows the token. That is the starting point, not the destination — [`policyFor`](#policyfor-versus-the-registration) is where a signing scheme goes, and [Signature schemes](#signature-schemes) covers the choice.

A processor takes the scope in its constructor instead, and registers from there. It is optional, because a processor also runs in the browser, where there is no HTTP server:

```typescript
import type {
  IWebhookEndpoints,
  WebhookReply,
  WebhookRequest,
} from "@powerhousedao/reactor-api";
import type { IHttpScope, IProcessor } from "@powerhousedao/shared/processors";

export class BillingProcessor implements IProcessor {
  #endpoints: Promise<IWebhookEndpoints | undefined>;

  constructor(http: IHttpScope | undefined) {
    // Registration rejects on a host with no webhook store. A host without
    // webhook triggers is not a host without your package, so absorb it.
    this.#endpoints =
      http?.webhooks
        .register({
          name: "invoices",
          onRequest: (request) => this.#deliver(request),
        })
        .catch(() => undefined) ?? Promise.resolve(undefined);
  }

  async endpointUrl(accountId: string): Promise<string | undefined> {
    const endpoints = await this.#endpoints;
    return (await endpoints?.endpointFor(accountId))?.url;
  }

  async #deliver(_request: WebhookRequest): Promise<WebhookReply> {
    return { status: 202 };
  }

  onOperations: IProcessor["onOperations"] = async () => {};
  async onDisconnect(): Promise<void> {}
}
```

`name` distinguishes several endpoint families within one package, so a package that receives both billing events and repository events registers twice with different names.

The URL is flat and namespaceless: `/webhooks/<token>`. The package and the key live in the token record, not in the path, so the URL leaks neither, and a token minted by one package can never dispatch into another's handler.

`endpointFor` is idempotent per key: the same key returns the same token, so a provider already registered against that URL is not left pointing at a dead one. It also answers with `createdAt`, so showing an author when the URL came into being does not mean listing every endpoint in the package. `list()` enumerates the family and `revoke(key)` retires one endpoint.

## `policyFor` versus the registration

Registration-level values go under `defaults`, and `policyFor` is merged over them. Put something in `defaults` **only when it is a property of your package's integration** and true for every endpoint in the family. Anything a document configures belongs in `policyFor`, which is called with the key on every delivery.

If an endpoint's settings come from a document an author can edit, they all belong in `policyFor`. It runs on every delivery, so it always sees the current values; a registration-level value is fixed at boot.

```typescript
async policyFor(key: string): Promise<WebhookPolicy | undefined> {
  const config = await this.loadConfig(key);
  if (!config?.enabled) return undefined; // not armed

  return {
    methods: ["POST"],
    challengeField: config.challengeField,
    dedupe: config.dedupeField
      ? { field: config.dedupeField, ttlSeconds: 900 }
      : undefined,
    verify: {
      scheme: "hmac-prefixed",
      secret: await this.resolveSecret(config.secretRef),
    },
  };
}
```

Two consequences worth spelling out:

- **Returning `undefined` disarms the endpoint**, and a disarmed endpoint answers exactly as an unknown token does.
- **A field only the document knows must be in `policyFor`.** Put `challengeField` on the registration alone and it is undefined at delivery time, so the provider's verification round is treated as a real delivery and the integration never gets established.

## Signature schemes

`verify.scheme` selects the signature layout, `verify.secret` is the resolved secret, `verify.header` overrides the scheme's conventional header, and `verify.toleranceSeconds` sets the replay window for timestamped schemes. Every comparison is constant-time and runs over the exact bytes received.

Schemes are named after the wire format, not the sender: the same layouts are used by many providers, so a brand name would fit one and mislead about the rest. Match the format your provider's documentation describes, and override `header` if it signs a different one.

| Scheme               | Default header        | What is checked                                                                                                                                            |
| -------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"none"`             | —                     | Nothing. Same as omitting `verify`.                                                                                                                        |
| `"token"`            | `x-webhook-token`     | The header equals the secret.                                                                                                                              |
| `"hmac"`             | `x-signature`         | The digest of the body, alone.                                                                                                                             |
| `"hmac-prefixed"`    | `x-hub-signature-256` | The digest behind a label, `sha256=<digest>`. GitHub signs this way.                                                                                       |
| `"hmac-timestamped"` | `stripe-signature`    | `t=<unix>,v1=<digest>`, digest over `<unix>.<body>`, within the replay window. Any `v1` may match, which is how key rotation works. Stripe signs this way. |

### The hash, the encoding and the label

The layout above is separate from three things a sender picks independently, so the scheme names carry none of them:

| Field       | Default          | Values                                                |
| ----------- | ---------------- | ----------------------------------------------------- |
| `algorithm` | `"sha256"`       | `"sha1"`, `"sha256"`, `"sha512"`                      |
| `encoding`  | `"hex"`          | `"hex"`, `"base64"`                                   |
| `prefix`    | `"<algorithm>="` | any literal; `""` for a prefixed layout with no label |

Folding these into the layout name would need one name per combination and still misname any scheme whose hash was overridden. Leave them out for the common case, and set only what your sender differs on:

```typescript
// A sender still on SHA-1, labelling its signature the older way.
verify: { scheme: "hmac-prefixed", secret, algorithm: "sha1" }
// prefix defaults to "sha1=" — it follows the algorithm.

// A sender that base64-encodes the digest under its own header.
verify: {
  scheme: "hmac",
  secret,
  encoding: "base64",
  header: "x-webhook-signature",
}
```

`prefix` applies only to `hmac-prefixed`: `hmac` has nothing before the digest, and `hmac-timestamped`'s `v1=` is structural rather than a label. Base64 comparison is case-sensitive; hex is not, so a sender that uppercases a hex digest still verifies.

A GitHub-style provider, where the secret is fixed for the package:

```typescript
await http.webhooks.register({
  name: "repository",
  // Fixed for every endpoint in this family, so it belongs in `defaults`.
  defaults: {
    methods: ["POST"],
    verify: {
      scheme: "hmac-prefixed",
      secret: process.env.GITHUB_WEBHOOK_SECRET,
    },
    // GitHub's delivery id is a header, not a body field.
    dedupe: { field: { header: "x-github-delivery" } },
  },
  onRequest: (request) => {
    const event = request.headers["x-github-event"];
    return { status: 202, body: `queued ${event ?? "event"}` };
  },
});
```

A Stripe-style provider, with the replay window written out and a JSON reply:

```typescript
const endpoints = await http.webhooks.register({
  name: "billing",
  defaults: {
    methods: ["POST"],
    // Stripe's event id is the top-level `id`; `data.object.id` would be the
    // subscription, which is stable across events.
    dedupe: { field: "id", ttlSeconds: 86_400 },
    maxBodyBytes: 512 * 1024,
  },
  policyFor: () => ({
    verify: {
      scheme: "hmac-timestamped",
      secret: process.env.STRIPE_WEBHOOK_SECRET,
      toleranceSeconds: 300,
    },
  }),
  onRequest: async (request) => {
    const event = request.body as { type: string };
    const applied = await applyBillingEvent(request.key, event.type);
    return {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ applied }),
    };
  },
});

const { url } = await endpoints.endpointFor("account-42");
```

The timestamped scheme's tolerance defaults to 300 seconds when you leave it out. A delivery whose timestamp falls outside the window is refused with `401` and never reaches `onRequest`.

Verification fails closed. A scheme other than `"none"` with `secret: undefined` refuses every delivery, so a secret your `policyFor` could not resolve produces `401`s rather than unverified runs. That is the right failure, but it does mean a broken secret store looks exactly like a provider with the wrong key. The log line carries the reason; the response never does, so a prober learns nothing from the body.

## The challenge round

`challengeField` names where the provider echoes a value back to prove the endpoint exists. When a delivery carries it, the service answers `200 text/plain` with the value and **does not invoke `onRequest`**:

```typescript
policyFor: () => ({ challengeField: "challenge" }),
```

Slack's `url_verification` round is exactly this. Without it, the probe is treated as a real delivery: the provider gets a `202` where it expected the echo, and refuses to register the URL.

The challenge is answered after signature verification, so a probe must carry a valid signature if the policy declares a scheme. It is answered before dedupe, so a repeated probe is always echoed.

## Dedupe

`dedupe.field` names the provider's own delivery id. The first delivery with a given value runs; a repeat within the TTL is answered `200` with an empty body and `onRequest` is not called again.

Providers disagree about where they put that id, so a field can be named three ways — and the same three work for `challengeField`:

| Form                              | Read from                                     | Example                                     |
| --------------------------------- | --------------------------------------------- | ------------------------------------------- |
| `"id"`                            | the query string, then a top-level body field | Stripe — its event id is the top-level `id` |
| `{ header: "x-github-delivery" }` | a request header                              | GitHub — its delivery id is a header        |
| `{ body: "payload.event.id" }`    | a dot-separated path into the parsed body     | any provider that nests the delivery id     |

Name the id that identifies **the delivery**, not the thing it is about. Stripe's `data.object.id` is the subscription, stable across events, so deduping on it would drop everything after the first.

A body path only resolves when the body parsed as JSON: with another content type, a body-sourced field finds nothing and every retry re-runs. Prefer a header source when the provider offers one.

```typescript
dedupe: { field: "delivery_id", ttlSeconds: 900 }, // default 300
```

A redelivery is answered as accepted rather than as an error, because the provider is retrying something it has no way of knowing succeeded. Telling it "no" makes it retry again; telling it "yes" stops the retry chain without running the work twice. Delivery records live in the reactor's relational store, so dedupe holds across processes and restarts.

Without `dedupe`, every retry runs. Set it whenever your handler does anything that must not happen twice.

## What the handler sees

`onRequest` receives a `WebhookRequest`:

- `key` — your key for this endpoint, from `endpointFor`.
- `method`, `path`, `queryParams`.
- `headers` — lowercased, with credentials redacted. `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `x-api-key`, the known signature headers and whatever header the policy's scheme reads are all replaced with `[redacted]`, so a header dump into a log or a run journal cannot carry a live secret.
- `raw` — the exact bytes received.
- `body` — JSON (and `+json`) parsed to an object, `application/x-www-form-urlencoded` parsed to an object, anything else the decoded text, and `undefined` for an empty body. A malformed JSON body arrives as text rather than throwing, since a malformed body is still evidence.

It returns a `WebhookReply`: `{ status, body?, contentType? }`. An unlabelled body is sent as `text/plain`, so a JSON reply says `contentType: "application/json"`. A HEAD delivery gets the status and no body.

## Sync or async

The reply is what the provider sees, and deciding when to send it is your call.

**Async** — answer immediately, do the work afterwards. This is the safe default:

```typescript
onRequest: (request) => {
  void this.startRun(request.key, request.body); // not awaited
  return { status: 202 };
},
```

**Sync** — hold the connection until the work finishes, so the provider learns the outcome. Providers time out in seconds and retry, so bound the wait yourself and answer `504` on expiry. Let the work continue rather than cancelling it, and rely on `dedupe` to absorb the retry. The reactor does not impose that timeout for you.

## Method and size limits

`methods` is uppercase, and `undefined` accepts every method. A method the policy excludes gets `405`. Leave `GET` allowed if your provider probes with it before accepting the URL, even when its deliveries are `POST`.

`maxBodyBytes` caps the payload, default 1 MiB, and a larger body is refused with `413` and the connection closed.

There is no rate limit here. Rate limiting belongs in front of the reactor, at your load balancer or CDN, where the limit is shared across instances rather than counted per process.

## Handling secrets

`verify.secret` is a resolved value. Only a reference belongs in a document (a `secret://…` form, or whatever your package's secret store issues) and the resolved secret belongs nowhere but the return value of `policyFor`, for the moment it takes to verify one delivery.

Concretely: resolve the ref inside `policyFor`, do not cache the plaintext on the document, do not write it into state, and do not log it. If resolution fails, return `secret: undefined` and let verification refuse the delivery. The service redacts the signature header and the known credential headers from what your handler sees, so a handler that journals `request.headers` cannot leak one by accident, but it cannot help with a secret your own code put somewhere.

## How a delivery is answered

Checks run in this order:

| Situation                                    | Answer                                                     |
| -------------------------------------------- | ---------------------------------------------------------- |
| Unknown or malformed token                   | `404` `{"error":"Unknown endpoint"}`                       |
| Token valid, package not loaded on this host | `503`                                                      |
| `policyFor` returned `undefined` (disarmed)  | `404`, byte-identical to an unknown token                  |
| Method the policy does not allow             | `405`                                                      |
| Body past `maxBodyBytes`                     | `413`                                                      |
| Signature verification failed                | `401`                                                      |
| Carries the `challengeField` value           | `200 text/plain`, the value echoed, `onRequest` not called |
| A repeat of a seen `dedupe` value            | `200`, empty, `onRequest` not called                       |
| Anything else                                | Whatever `onRequest` returns                               |

A disarmed endpoint answers exactly as an unknown token does, so someone probing tokens cannot tell a live endpoint from one that never existed. A verification failure answers `401` instead, since a caller holding a valid token has already proved the endpoint is there.

## Across restarts and reloads

Tokens live in the reactor's relational store, not in the package. So:

- A token stays valid when the package reloads, and the same key mints the same token afterwards. A redeploy does not force re-registration with every provider.
- While the owning package is not loaded, its endpoints answer `503`. The token is real; nothing on this host can serve it yet.
- Any host in a fleet can serve any endpoint, since the token record carries the package and the key.

Endpoints are not revoked on teardown. `revoke(key)` is the only thing that retires one.
