/**
 * `ensureDrive` on a client alone (no `ReactorClientModule`), against a real
 * embedded reactor. The light view hands it only the methods the remote
 * `GraphQLReactorClient` also has, so a call outside them fails here, and it
 * records every write the view submits.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import type { IReactorClient } from "@powerhousedao/reactor";
import { GraphQLReactorClient } from "@powerhousedao/reactor-browser/graphql-client";
import { buildReactor } from "../../src/integrations/powerhouse/reactor.js";
import { ensureDrive } from "../../src/integrations/powerhouse/drive.js";
import { deterministicId } from "../../src/integrations/powerhouse/identity.js";
import { policyOfHeader } from "../../src/integrations/powerhouse/signing.js";
import type { ReactorClientModule } from "../../src/integrations/powerhouse/types.js";

/** What ensureDrive may call: on the client, and on its write half. */
const CLIENT_METHODS = ["find", "newDocument"] as const;
const WRITE_METHODS = ["create"] as const;

type LightView = { client: IReactorClient; writes: string[] };

/** The client reduced to the methods ensureDrive may call, writes recorded. */
function lightView(client: IReactorClient): LightView {
  const writes: string[] = [];
  const pick = (source: object, names: readonly string[], log?: string[]) =>
    Object.fromEntries(
      names.map((name) => {
        const method = (
          source as Record<string, (...args: unknown[]) => unknown>
        )[name].bind(source);
        return [
          name,
          (...args: unknown[]) => {
            log?.push(name);
            return method(...args);
          },
        ];
      }),
    );
  const view = {
    ...pick(client, CLIENT_METHODS),
    write: pick(client.write, WRITE_METHODS, writes),
  } as unknown as IReactorClient;
  return { client: view, writes };
}

/** A drive as read back, as far as these tests look at it. */
type ReadDrive = {
  header: {
    id: string;
    name: string;
    protocolVersions?: Record<string, number> | null;
    meta?: { preferredEditor?: string };
  };
  state: { global: { name: string } };
};

async function readDrive(id: string): Promise<ReadDrive> {
  return (await reactorModule.client.get(id)) as unknown as ReadDrive;
}

const testDir = join(
  tmpdir(),
  `ensure-drive-test-${randomBytes(4).toString("hex")}`,
);
let reactorModule: ReactorClientModule;

beforeAll(async () => {
  reactorModule = await buildReactor({
    documentModels: [],
    storagePath: join(testDir, "reactor-storage"),
    enableSync: false,
  });
}, 30_000);

afterAll(async () => {
  if (reactorModule) {
    try {
      await reactorModule.reactor.kill().completed;
    } catch {}
  }
  await rm(testDir, { recursive: true, force: true }).catch(() => {});
});

describe("ensureDrive on a client alone", () => {
  it("only needs what the remote GraphQLReactorClient offers", () => {
    const remote = new GraphQLReactorClient({
      url: "http://127.0.0.1:1/graphql",
      realtime: false,
    }) as unknown as Record<string, unknown> & {
      write: Record<string, unknown>;
    };
    for (const name of CLIENT_METHODS) {
      expect(typeof remote[name], name).toBe("function");
    }
    for (const name of WRITE_METHODS) {
      expect(typeof remote.write[name], `write.${name}`).toBe("function");
    }
    // Why ensureDrive does not use it. It names the drive in its one create,
    // though the light client renames too.
    expect(remote.write.createEmpty).toBeUndefined();
  });

  it("creates a v2-required drive in one write, named, and finds it by name on the next call", async () => {
    const { client, writes } = lightView(reactorModule.client);
    const first = await ensureDrive(client, { name: "Light Home" });
    expect(first.id.length).toBeGreaterThan(0);
    expect(first.deferred).toBeUndefined();
    expect(writes).toEqual(["create"]);

    const drive = await readDrive(first.id);
    expect(policyOfHeader(drive.header)).toBe("v2-required");
    expect(drive.header.name).toBe("Light Home");
    // What Connect shows as the drive's name.
    expect(drive.state.global.name).toBe("Light Home");

    const again = await ensureDrive(client, { name: "Light Home" });
    expect(again).toEqual({ id: first.id, name: "Light Home" });
    expect(writes).toEqual(["create"]);
  }, 30_000);

  it("creates a legacy drive under a deterministic id with a preferred editor, once", async () => {
    const { client, writes } = lightView(reactorModule.client);
    const wantedId = deterministicId("ensure-drive-test", "fixed");
    const created: string[] = [];

    const first = await ensureDrive(client, {
      id: wantedId,
      name: "Fixed",
      preferredEditor: "test-editor",
      onCreated: (id) => {
        created.push(id);
      },
    });
    expect(first).toEqual({ id: wantedId, name: "Fixed" });
    expect(writes).toEqual(["create"]);
    const doc = await readDrive(wantedId);
    expect(policyOfHeader(doc.header)).toBe("legacy");
    expect(doc.header.name).toBe("Fixed");
    expect(doc.state.global.name).toBe("Fixed");
    expect(doc.header.meta?.preferredEditor).toBe("test-editor");

    // Found again by name, with no id given.
    const byName = await ensureDrive(client, { name: "Fixed" });
    expect(byName.id).toBe(wantedId);
    const byId = await ensureDrive(client, {
      id: wantedId,
      name: "Fixed",
      onCreated: (id) => {
        created.push(id);
      },
    });
    expect(byId.id).toBe(wantedId);
    expect(created).toEqual([wantedId]);
    expect(writes).toEqual(["create"]);
  }, 30_000);

  it("defers a drive it may not create, and creates it once allowed", async () => {
    const { client, writes } = lightView(reactorModule.client);
    let allowed = false;
    const config = {
      name: "Deferred",
      matchByName: false,
      canCreate: () => allowed,
    };

    expect(await ensureDrive(client, config)).toEqual({
      id: "",
      name: "Deferred",
      deferred: true,
    });
    expect(writes).toEqual([]);

    allowed = true;
    const created = await ensureDrive(client, config);
    expect(created.deferred).toBeUndefined();
    expect(created.id.length).toBeGreaterThan(0);
    expect(writes).toEqual(["create"]);
  }, 30_000);

  it("takes the drive a host pointer resolves", async () => {
    const { client } = lightView(reactorModule.client);
    const home = await ensureDrive(client, { name: "Pointed Target" });

    const pointed = await ensureDrive(client, {
      name: "Pointer",
      matchByName: false,
      resolveId: async () => home.id,
      canCreate: () => false,
    });
    expect(pointed).toEqual({ id: home.id, name: "Pointer" });
  }, 30_000);

  it("works the same on the full embedded client", async () => {
    const first = await ensureDrive(reactorModule.client, {
      name: "Full Home",
    });
    const again = await ensureDrive(reactorModule.client, {
      name: "Full Home",
    });
    expect(again.id).toBe(first.id);
  }, 30_000);
});
