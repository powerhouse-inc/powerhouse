// The detectors read what the framework's own builders produce.
import {
  createTrigger,
  PieceAuth,
  Property,
  TriggerStrategy,
  WebhookRenewStrategy,
} from "@powerhousedao/pieces-framework";
import { describe, expect, it } from "vitest";
import {
  authMethodFor,
  triggerRenew,
  unsupportedAuth,
  unsupportedTrigger,
} from "./unsupported.js";

const ISSUES = "https://github.com/powerhouse-inc/powerhouse/issues/";
const feature = (value: { feature: string } | undefined) => value?.feature;

describe("unsupportedAuth", () => {
  it("names OIDC, client-credentials OAuth2 and CustomAuth refresh", () => {
    const oidc = PieceAuth.OIDC({ required: true, props: {} });
    const oauth = PieceAuth.OAuth2({
      authUrl: "https://example.com/auth",
      tokenUrl: "https://example.com/token",
      required: true,
      scope: [],
    });
    const custom = PieceAuth.CustomAuth({
      required: true,
      props: {
        key: Property.ShortText({ displayName: "Key", required: true }),
      },
    });
    const refreshing = PieceAuth.CustomAuth({
      required: true,
      props: {},
      refresh: {
        generate: () => Promise.resolve({ access_token: "t" }),
      },
    });
    expect(unsupportedAuth(oauth)).toBeUndefined();
    expect(
      feature(unsupportedAuth({ ...oauth, grantType: "client_credentials" })),
    ).toBe("OAuth2 client credentials");
    expect(feature(unsupportedAuth(oidc))).toBe("OIDC auth");
    // Several methods run if any one does; otherwise the first says why.
    expect(unsupportedAuth([custom, oidc])).toBeUndefined();
    expect(feature(unsupportedAuth([oidc, refreshing]))).toBe("OIDC auth");
    expect(feature(unsupportedAuth(refreshing))).toBe("CustomAuth refresh");
  });

  it("passes the auth this engine runs", () => {
    expect(unsupportedAuth(undefined)).toBeUndefined();
    expect(
      unsupportedAuth(
        PieceAuth.SecretText({ displayName: "Key", required: true }),
      ),
    ).toBeUndefined();
    expect(
      unsupportedAuth(PieceAuth.CustomAuth({ required: true, props: {} })),
    ).toBeUndefined();
  });
});

describe("authMethodFor", () => {
  const key = PieceAuth.SecretText({ displayName: "Key", required: true });
  const custom = PieceAuth.CustomAuth({ required: true, props: {} });

  it("picks the method of the connection's type among several", () => {
    expect(authMethodFor([key, custom], "CUSTOM_AUTH")).toBe(custom);
    expect(authMethodFor([key, custom], "BASIC_AUTH")).toBeUndefined();
  });

  it("returns a single method whatever the type", () => {
    expect(authMethodFor(key, "CUSTOM_AUTH")).toBe(key);
  });
});

describe("unsupportedTrigger", () => {
  const webhook = (renew?: { cronExpression: string }) =>
    createTrigger({
      name: "t",
      displayName: "T",
      description: "",
      props: {},
      sampleData: {},
      type: TriggerStrategy.WEBHOOK,
      ...(renew
        ? {
            renewConfiguration: {
              strategy: WebhookRenewStrategy.CRON,
              cronExpression: renew.cronExpression,
            },
          }
        : {}),
      onEnable: () => Promise.resolve(),
      onDisable: () => Promise.resolve(),
      run: () => Promise.resolve([]),
    });

  it("runs a CRON renewal, and refuses one that cannot run", () => {
    expect(unsupportedTrigger(webhook())).toBeUndefined();
    expect(
      unsupportedTrigger(webhook({ cronExpression: "0 */12 * * *" })),
    ).toBeUndefined();
    expect(
      unsupportedTrigger(webhook({ cronExpression: "not a cron" }))?.reason,
    ).toBe(`renewConfiguration cron "not a cron" is invalid (${ISSUES}3090)`);
    expect(
      unsupportedTrigger({
        type: "WEBHOOK",
        renewConfiguration: { strategy: "INTERVAL" },
      })?.reason,
    ).toBe(
      `renewConfiguration strategy INTERVAL is not supported (${ISSUES}3090)`,
    );
  });

  it("reads the renewal a trigger declares", () => {
    expect(triggerRenew(webhook())).toBeUndefined();
    expect(triggerRenew(webhook({ cronExpression: "0 */12 * * *" }))).toEqual({
      strategy: "CRON",
      cronExpression: "0 */12 * * *",
    });
    expect(triggerRenew(webhook({ cronExpression: "nope" }))).toBeUndefined();
  });

  it("names a MANUAL trigger", () => {
    const manual = createTrigger({
      name: "m",
      displayName: "M",
      description: "",
      props: {},
      sampleData: {},
      type: TriggerStrategy.MANUAL,
      onEnable: () => Promise.resolve(),
      onDisable: () => Promise.resolve(),
      run: () => Promise.resolve([]),
    });
    expect(feature(unsupportedTrigger(manual))).toBe("TriggerStrategy.MANUAL");
  });

  it("names an APP_WEBHOOK trigger, which nothing here can deliver", () => {
    const app = createTrigger({
      name: "a",
      displayName: "A",
      description: "",
      props: {},
      sampleData: {},
      type: TriggerStrategy.APP_WEBHOOK,
      onEnable: () => Promise.resolve(),
      onDisable: () => Promise.resolve(),
      run: () => Promise.resolve([]),
    });
    const refused = unsupportedTrigger(app);
    expect(feature(refused)).toBe("TriggerStrategy APP_WEBHOOK");
    expect(refused?.reason).toContain("app-level webhooks");
  });

  it("names a strategy it has never heard of, or none at all", () => {
    expect(unsupportedTrigger({ type: "STREAMING" })?.reason).toContain(
      'Unknown trigger strategy "STREAMING"',
    );
    expect(unsupportedTrigger({})?.reason).toContain("declares no strategy");
  });
});
