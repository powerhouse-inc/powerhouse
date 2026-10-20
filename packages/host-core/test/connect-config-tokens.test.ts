import { connectConfigSchema } from "@powerhousedao/shared/connect/connect-config-schema";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { OutputRef } from "../src/resolve/declared.js";
import {
  resolveHostOutputs,
  type OutputSource,
} from "../src/resolve/resolve.js";
import {
  validateDeclaredHost,
  validateHost,
  type RunnerModule,
} from "../src/runner-resolver.js";
import type { OutputToken } from "../src/tokens.js";
import * as connectRunner from "./fixtures/hosts/_packages/ph-cli/connect.js";
import * as switchboardRunner from "./fixtures/hosts/_packages/ph-cli/switchboard.js";

/**
 * A connect host's `config` takes output tokens in the Connect config fields
 * that name another host's outputs (`drives.defaultDrives[].url`,
 * `renown.switchboardUrl`): declared validation checks their paths against
 * the producer's outputsSchema, the generic resolver replaces them, and the
 * resolved config is plain Connect config. The runner is the fixture mirror
 * of `@powerhousedao/ph-cli/runners/connect` (same `config` schema).
 */

const SPEC = "@powerhousedao/ph-cli/runners/connect";
const FILE = "hosts/connect/host.js";
const runner = connectRunner as unknown as RunnerModule;

const ORIGIN = "http://127.0.0.1:4001";
const CANNED = {
  origin: ORIGIN,
  endpoints: { graphql: `${ORIGIN}/graphql` },
  drives: { sektar: { id: "sektar", url: `${ORIGIN}/d/sektar` } },
};

const outputsSchemaOf = (ref: OutputRef) =>
  ref.host === "switchboard"
    ? { schema: switchboardRunner.outputsSchema, label: 'host "switchboard"' }
    : { error: `names host "${ref.host}", which is not a fixture.` };

const outputs: OutputSource = {
  lookup: (ref) =>
    ref.host === "switchboard"
      ? { status: "available", outputs: CANNED }
      : { status: "unavailable", message: `"${ref.host}" is not running.` },
};

function connectHost(drivePath: (string | number)[]) {
  return {
    name: "connect",
    runner: { module: SPEC },
    config: {
      drives: {
        defaultDrives: [
          {
            url: { $output: { host: "switchboard", path: drivePath } },
            name: "Sektar",
          },
          { local: true as const, id: "scratch" },
        ],
      },
      renown: {
        switchboardUrl: {
          $output: { host: "switchboard", path: ["endpoints", "graphql"] },
        },
      },
    },
  };
}

describe("connect host config: output tokens in Connect URL fields", () => {
  it("passes declared validation, resolves from outputs, and the resolved config is plain Connect config", () => {
    const host = connectHost(["drives", "sektar", "url"]);
    validateDeclaredHost(runner, SPEC, host, FILE, { outputsSchemaOf });

    const resolved = resolveHostOutputs(host, { outputs, where: FILE });
    const parsed = validateHost(runner, SPEC, resolved, FILE) as {
      config: unknown;
    };
    expect(parsed.config).toEqual({
      drives: {
        defaultDrives: [
          { url: `${ORIGIN}/d/sektar`, name: "Sektar" },
          { local: true, id: "scratch" },
        ],
      },
      renown: { switchboardUrl: `${ORIGIN}/graphql` },
    });
    // What the connect runner serves: the plain, token-free schema.
    expect(connectConfigSchema.parse(parsed.config)).toEqual(parsed.config);
  });

  it("fails declared validation on a bad token path, naming the host path and the token path", () => {
    expect(() =>
      validateDeclaredHost(
        runner,
        SPEC,
        connectHost(["drives", "sektar", "uri"]),
        FILE,
        { outputsSchemaOf },
      ),
    ).toThrow(
      /hosts\/connect\/host\.js: invalid output token:\n {2}- config\.drives\.defaultDrives\[0\]\.url: \$output switchboard › drives\.sektar\.uri: outputs\.drives\.sektar has no key "uri" \(keys: id, url\)/,
    );
  });

  it("keeps tokens out of the resolved form and out of the plain schema", () => {
    const host = connectHost(["drives", "sektar", "url"]);
    expect(() => validateHost(runner, SPEC, host, FILE)).toThrow(
      /`config\.drives\.defaultDrives\[0\]\.url` is an unresolved output token/,
    );
    expect(connectConfigSchema.safeParse(host.config).success).toBe(false);
  });

  it("rejects a token in a Connect field that is not token-able", () => {
    const host = {
      name: "connect",
      runner: { module: SPEC },
      config: {
        renown: {
          url: { $output: { host: "switchboard", path: ["origin"] } },
        },
      },
    };
    expect(() =>
      validateDeclaredHost(runner, SPEC, host, FILE, { outputsSchemaOf }),
    ).toThrow(/config\.renown\.url: this field does not take an output token/);
  });

  it("types the declared config input with tokens and the parsed config as plain strings", () => {
    type Declared = z.input<typeof connectRunner.declaredHostSchema>;
    type DefaultDrive = NonNullable<
      NonNullable<NonNullable<Declared["config"]>["drives"]>["defaultDrives"]
    >[number];
    expectTypeOf<OutputToken<string>>().toMatchTypeOf<
      Extract<DefaultDrive, { url: unknown }>["url"]
    >();
    const ok: Declared = connectHost(["drives", "sektar", "url"]);
    expect(ok.name).toBe("connect");
    const bad: Declared = {
      name: "connect",
      runner: { module: SPEC },
      config: {
        // @ts-expect-error -- renown.url is not token-able
        renown: { url: { $output: { host: "switchboard", path: [] } } },
      },
    };
    expect(bad.name).toBe("connect");

    type Parsed = z.output<typeof connectRunner.hostSchema>;
    type ParsedDrive = NonNullable<
      NonNullable<NonNullable<Parsed["config"]>["drives"]>["defaultDrives"]
    >[number];
    expectTypeOf<
      Extract<ParsedDrive, { url: unknown }>["url"]
    >().toEqualTypeOf<string>();
    expectTypeOf<
      NonNullable<NonNullable<Parsed["config"]>["renown"]>["switchboardUrl"]
    >().toEqualTypeOf<string | undefined>();
  });
});
