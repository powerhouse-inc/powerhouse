import { describe, expect, it } from "vitest";
import {
  connectorIdForPiece,
  packageFromConnectorId,
  planFromAuth,
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
