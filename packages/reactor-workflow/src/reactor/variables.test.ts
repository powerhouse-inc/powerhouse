import { describe, expect, it } from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import { InMemorySecretProvider } from "../pieces/index.js";
import { LocalEncryptedSecretStore } from "./secret-store.js";
import { resolveVariables } from "./variables.js";

const REF = `secret://v1:${"a".repeat(32)}`;
const secrets = new InMemorySecretProvider({ [REF]: "s3cret-value" });

describe("resolveVariables", () => {
  it("coerces each type and leaves untyped values as authored", async () => {
    const { variables, secretValues } = await resolveVariables(
      [
        { key: "text", value: 12, type: "TEXT" },
        { key: "number", value: " 3.5 ", type: "NUMBER" },
        { key: "yes", value: "TRUE", type: "BOOLEAN" },
        { key: "no", value: 0, type: "BOOLEAN" },
        { key: "json", value: "[1]", type: "JSON" },
        { key: "object", value: { a: 1 }, type: "JSON" },
        { key: "empty", value: "", type: "NUMBER" },
        { key: "secret", value: REF, type: "SECRET" },
        { key: "untyped", value: "42", type: null },
        { key: "legacy", value: { b: 2 } },
      ],
      secrets,
      "wf-test",
    );
    expect(Object.fromEntries(variables.map((v) => [v.key, v.value]))).toEqual({
      text: "12",
      number: 3.5,
      yes: true,
      no: false,
      json: [1],
      object: { a: 1 },
      empty: null,
      secret: "s3cret-value",
      untyped: "42",
      legacy: { b: 2 },
    });
    expect(secretValues).toEqual(["s3cret-value"]);
  });

  it("refuses values that do not fit their type", async () => {
    await expect(
      resolveVariables(
        [{ key: "b", value: "maybe", type: "BOOLEAN" }],
        secrets,
        "wf-test",
      ),
    ).rejects.toThrow('Variable "b" is a BOOLEAN');
    await expect(
      resolveVariables(
        [{ key: "j", value: "{", type: "JSON" }],
        secrets,
        "wf-test",
      ),
    ).rejects.toThrow('Variable "j" is JSON, but its value does not parse');
  });

  it("names the ref, not a value, when a secret does not resolve", async () => {
    const missing = `secret://v1:${"c".repeat(32)}`;
    await expect(
      resolveVariables(
        [{ key: "s", value: missing, type: "SECRET" }],
        secrets,
        "wf-test",
      ),
    ).rejects.toThrow(
      `Secret variable "s" could not be resolved: No secret found for ref "${missing}"`,
    );
  });

  it("resolves a SECRET only for the workflow it was minted for", async () => {
    const store = await LocalEncryptedSecretStore.create(
      createFreshRelationalDb(),
      { masterKeyHex: "ab".repeat(32) },
    );
    const { ref } = await store.create({ value: "wf-a-key", ownerId: "wf-a" });
    const variables = [{ key: "s", value: ref, type: "SECRET" as const }];

    await expect(
      resolveVariables(variables, store, "wf-a"),
    ).resolves.toMatchObject({ secretValues: ["wf-a-key"] });
    await expect(resolveVariables(variables, store, "wf-b")).rejects.toThrow(
      'Secret variable "s" could not be resolved: This secret belongs to another workflow; enter it again',
    );
  });
});
