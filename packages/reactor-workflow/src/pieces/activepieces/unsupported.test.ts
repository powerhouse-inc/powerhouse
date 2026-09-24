// The detectors read what the framework's own builders produce.
import {
  createTrigger,
  PieceAuth,
  Property,
  TriggerStrategy,
  WebhookRenewStrategy,
} from "@powerhousedao/pieces-framework";
import { describe, expect, it } from "vitest";
import { unsupportedAuth, unsupportedTrigger } from "./unsupported.js";

const feature = (value: { feature: string } | undefined) => value?.feature;

describe("unsupportedAuth", () => {
  it("names OAuth2, OIDC, multi-auth and CustomAuth refresh", () => {
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
    expect(feature(unsupportedAuth(oauth))).toBe("OAuth2 auth");
    expect(
      feature(unsupportedAuth(PieceAuth.OIDC({ required: true, props: {} }))),
    ).toBe("OIDC auth");
    expect(feature(unsupportedAuth([custom, oauth]))).toBe(
      "Multi-auth (auth as an array)",
    );
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

  it("names a trigger that renews, not one createTrigger defaulted", () => {
    expect(unsupportedTrigger(webhook())).toBeUndefined();
    expect(
      feature(unsupportedTrigger(webhook({ cronExpression: "0 */12 * * *" }))),
    ).toBe("renewConfiguration");
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
});
