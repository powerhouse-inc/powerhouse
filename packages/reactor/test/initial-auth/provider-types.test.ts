import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("retains provider inference and binding safety in the emitted public declarations", () => {
  const directory = mkdtempSync(join(tmpdir(), "initial-auth-provider-"));
  try {
    const source = `import { defineInitialAuthProvider } from "${resolve(import.meta.dirname, "../../dist/index.js")}";
import { authAddress, authGroupId } from "${resolve(import.meta.dirname, "../../../shared/dist/document-model/index.js")}";
import { referenceNote, referenceCompanyGroup } from "${resolve(import.meta.dirname, "./reference-app.js")}";
const admin = authAddress("administrator");
defineInitialAuthProvider(referenceNote, {
  deployment: { administrator: admin },
  authorizeCreation({ initialState }) {
    const title: string = initialState.global.title;
    // @ts-expect-error state is inferred from the model
    const wrong: number = initialState.global.title;
    // @ts-expect-error unknown state field
    initialState.global.unknownField;
    // @ts-expect-error provider callbacks inspect immutable initial values
    initialState.global.title = "changed";
    void title; void wrong;
  },
  resolveInstance: async () => ({ owner: authAddress("owner") }),
});
defineInitialAuthProvider(referenceNote, {
  // @ts-expect-error binding kinds are distinct
  deployment: { administrator: authGroupId("group") },
  authorizeCreation() {},
  resolveInstance: async () => ({ owner: authAddress("owner") }),
});
defineInitialAuthProvider(referenceNote, {
  // @ts-expect-error deployment binding is required
  deployment: {},
  authorizeCreation() {},
  resolveInstance: async () => ({ owner: authAddress("owner") }),
});
defineInitialAuthProvider(referenceNote, {
  // @ts-expect-error undeclared deployment key
  deployment: { administrator: admin, wrong: admin },
  authorizeCreation() {},
  resolveInstance: async () => ({ owner: authAddress("owner") }),
});
defineInitialAuthProvider(referenceNote, {
  deployment: { administrator: admin },
  authorizeCreation() {},
  // @ts-expect-error instance owner is required
  resolveInstance: async () => ({}),
});
defineInitialAuthProvider(referenceNote, {
  deployment: { administrator: admin },
  authorizeCreation() {},
  // @ts-expect-error instance owner must be an address
  resolveInstance: async () => ({ owner: authGroupId("group") }),
});
// @ts-expect-error provider requires an initial authorization declaration
defineInitialAuthProvider(referenceCompanyGroup, { deployment: {}, authorizeCreation() {}, resolveInstance: async () => ({}) });
`;
    writeFileSync(join(directory, "consumer.mts"), source);
    writeFileSync(
      join(directory, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "NodeNext",
          target: "ESNext",
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          types: [],
        },
        files: ["consumer.mts"],
      }),
    );
    const result = spawnSync(
      process.execPath,
      [
        resolve(
          import.meta.dirname,
          "../../../../node_modules/typescript/bin/tsc",
        ),
        "-p",
        join(directory, "tsconfig.json"),
        "--pretty",
        "false",
      ],
      { encoding: "utf8" },
    );
    if (result.error) throw result.error;
    expect(result.stdout + result.stderr).toBe("");
    expect(result.status).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
