import { describe, expect, it } from "vitest";
import {
  childrenSchema,
  profileSchema,
  reactorSchema,
} from "../src/host-schemas.js";

describe("reactorSchema (strict per D2.d)", () => {
  it("accepts a full valid block", () => {
    const result = reactorSchema.safeParse({
      backends: {
        main: {
          kind: "in-process",
          storage: { kind: "path", dataDir: "./.ph/data" },
          readModel: { url: "dev.db" },
          packages: { dynamic: true },
        },
        remote: { kind: "remote", remote: { url: "https://sb.example" } },
      },
      placement: { primary: "main" },
      workflows: true,
      protocol: {
        featureFlags: { documentDecisions: true },
        createSignaturePolicy: "v2-required",
        unsupportedStoredDocuments: "refuse",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a typo'd protocol key with its path (fleet-consensus safety)", () => {
    const result = reactorSchema.safeParse({
      protocol: { featureFlags: { documentDecisionz: true } },
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("documentDecisionz");
  });

  it("rejects unknown top-level reactor keys", () => {
    expect(reactorSchema.safeParse({ consensus: {} }).success).toBe(false);
  });

  it("rejects an invalid storage kind and signature policy", () => {
    expect(
      reactorSchema.safeParse({
        backends: { main: { storage: { kind: "sqlite" } } },
      }).success,
    ).toBe(false);
    expect(
      reactorSchema.safeParse({
        protocol: { createSignaturePolicy: "v3" },
      }).success,
    ).toBe(false);
  });
});

describe("profileSchema", () => {
  it("accepts the documented fields, rejects unknown ones", () => {
    expect(
      profileSchema.safeParse({
        appId: "inc.powerhouse.vetra",
        name: "Vetra",
        description: "Builder studio",
        icon: "./icon.svg",
      }).success,
    ).toBe(true);
    expect(profileSchema.safeParse({ displayName: "x" }).success).toBe(false);
  });
});

describe("childrenSchema", () => {
  it("accepts wrappers and validates member reactor overrides strictly", () => {
    expect(
      childrenSchema.safeParse({
        "vetra-switchboard": {
          host: "switchboard",
          runner: { port: 7064 },
          reactor: { workflows: true },
        },
      }).success,
    ).toBe(true);
    expect(
      childrenSchema.safeParse({
        member: { host: "switchboard", reactor: { workflowz: true } },
      }).success,
    ).toBe(false);
  });
});
