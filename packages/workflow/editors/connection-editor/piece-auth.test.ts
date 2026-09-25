import { describe, expect, it } from "vitest";
import {
  connectorIdForPiece,
  isAuthComplete,
  isConfigValueMissing,
  packageFromConnectorId,
  planFromAuth,
  type AuthPlan,
} from "./piece-auth.js";

describe("planFromAuth", () => {
  it("maps SECRET_TEXT to a single secret field", () => {
    const plan = planFromAuth({
      type: "SECRET_TEXT",
      displayName: "API Token",
      required: true,
    });
    expect(plan.authType).toBe("SECRET_TEXT");
    expect(plan.supported).toBe(true);
    expect(plan.configFields).toEqual([]);
    expect(plan.secretFields).toHaveLength(1);
    expect(plan.secretFields[0]).toMatchObject({
      name: "value",
      displayName: "API Token",
      required: true,
    });
  });

  it("splits CUSTOM_AUTH props into config and secrets", () => {
    const plan = planFromAuth({
      type: "CUSTOM_AUTH",
      props: {
        base_url: {
          displayName: "Base URL",
          required: true,
          type: "SHORT_TEXT",
        },
        api_key: {
          displayName: "API Key",
          required: true,
          type: "SECRET_TEXT",
        },
      },
    });
    expect(plan.authType).toBe("CUSTOM_AUTH");
    expect(plan.configFields.map((field) => field.name)).toEqual(["base_url"]);
    expect(plan.secretFields.map((field) => field.name)).toEqual(["api_key"]);
  });

  it("maps BASIC_AUTH to username config + password secret", () => {
    const plan = planFromAuth({ type: "BASIC_AUTH" });
    expect(plan.configFields.map((field) => field.name)).toEqual(["username"]);
    expect(plan.secretFields.map((field) => field.name)).toEqual(["password"]);
  });

  it("marks OAUTH2 unsupported", () => {
    const plan = planFromAuth({ type: "OAUTH2" });
    expect(plan.authType).toBe("OAUTH2");
    expect(plan.supported).toBe(false);
  });

  it("prefers a supported method from a multi-auth array", () => {
    const plan = planFromAuth([
      { type: "OAUTH2" },
      { type: "SECRET_TEXT", displayName: "Bot Token" },
    ]);
    expect(plan.authType).toBe("SECRET_TEXT");
    expect(plan.supported).toBe(true);
  });

  it("defaults to NONE when authless", () => {
    expect(planFromAuth(null).authType).toBe("NONE");
    expect(planFromAuth(undefined).supported).toBe(true);
  });
});

describe("isConfigValueMissing", () => {
  it("treats undefined, null and empty string as missing", () => {
    expect(isConfigValueMissing(undefined)).toBe(true);
    expect(isConfigValueMissing(null)).toBe(true);
    expect(isConfigValueMissing("")).toBe(true);
  });

  it("treats false and 0 as present", () => {
    expect(isConfigValueMissing(false)).toBe(false);
    expect(isConfigValueMissing(0)).toBe(false);
  });
});

describe("isAuthComplete", () => {
  const plan: AuthPlan = {
    authType: "CUSTOM_AUTH",
    configFields: [
      { name: "host", displayName: "Host", required: true },
      { name: "port", displayName: "Port", required: false },
    ],
    secretFields: [{ name: "token", displayName: "Token", required: true }],
    supported: true,
  };

  it("is complete once every required field is filled", () => {
    expect(
      isAuthComplete(plan, { host: "a" }, new Map([["token", "ref-1"]])),
    ).toBe(true);
  });

  it("is incomplete when a required config value is missing, null or empty", () => {
    expect(isAuthComplete(plan, {}, new Map([["token", "ref-1"]]))).toBe(false);
    expect(
      isAuthComplete(plan, { host: null }, new Map([["token", "ref-1"]])),
    ).toBe(false);
    expect(
      isAuthComplete(plan, { host: "" }, new Map([["token", "ref-1"]])),
    ).toBe(false);
  });

  it("is incomplete when a required secret ref is missing", () => {
    expect(isAuthComplete(plan, { host: "a" }, new Map())).toBe(false);
  });

  it("ignores optional fields whether filled or not", () => {
    const withOptionalSecret: AuthPlan = {
      ...plan,
      secretFields: [
        ...plan.secretFields,
        { name: "refresh", displayName: "Refresh", required: false },
      ],
    };
    const token = new Map([["token", "ref-1"]]);
    expect(isAuthComplete(withOptionalSecret, { host: "a" }, token)).toBe(true);
    expect(
      isAuthComplete(
        withOptionalSecret,
        { host: "a", port: 8080 },
        new Map([...token, ["refresh", "ref-2"]]),
      ),
    ).toBe(true);
    // An optional value never stands in for a required one.
    expect(
      isAuthComplete(
        withOptionalSecret,
        { port: 8080 },
        new Map([["refresh", "ref-2"]]),
      ),
    ).toBe(false);
  });
});

describe("connector ids", () => {
  it("derives the piece short name", () => {
    expect(connectorIdForPiece("@activepieces/piece-gotify")).toBe(
      "@activepieces/piece-gotify#gotify",
    );
  });

  it("round-trips back to the package name", () => {
    expect(packageFromConnectorId("@activepieces/piece-gotify#gotify")).toBe(
      "@activepieces/piece-gotify",
    );
    expect(packageFromConnectorId("@activepieces/piece-slack")).toBe(
      "@activepieces/piece-slack",
    );
  });
});
