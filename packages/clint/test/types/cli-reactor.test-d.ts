/**
 * Compile-time type tests for what a Cli hands the Powerhouse integration:
 * its own document model modules, and its own reactor client to
 * `ensureDrive`.
 *
 * Type-checked by `tsc` (the package's tsconfig includes test/types).
 */

import { expectTypeOf } from "expect-type";
import { z } from "zod";
import type { IReactorClient } from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { createTypes, defineRegistry } from "../../src/index.js";
import type {
  DriveConfig,
  EnsureDriveClient,
  RemoteReactorConfig,
  TypedReactorClient,
} from "../../src/index.js";
import {
  attachRemoteReactor,
  ensureDrive,
} from "../../src/integrations/powerhouse/index.js";

// Concrete modules, each typed with its own state, as a Cli imports them.
const models = [driveDocumentModelModule, documentModelDocumentModelModule];

// ── documentModels: any model module, mutable or readonly ──────────

const remote: RemoteReactorConfig = { documentModels: models };
const asConst = [driveDocumentModelModule] as const;
const remoteAsConst: RemoteReactorConfig = { documentModels: asConst };
void remote;
void remoteAsConst;

async function checkModuleTakers() {
  await attachRemoteReactor({
    url: "http://localhost:4001/d/home",
    documentModels: asConst,
  });
}

// ── ensureDrive on a Cli's own reactor ─────────────────────────────

const registry = defineRegistry([documentModelDocumentModelModule] as const);
const { defineTrigger } = createTypes({
  configSchema: z.object({}),
  registry,
});

// A drive config that reads a pointer the host keeps, as a Cli writes one.
const pointed: DriveConfig = {
  name: "Home",
  matchByName: false,
  resolveId: async (client) => (await client.get("pointer")).header.id,
};

defineTrigger({
  id: "bootstrap",
  type: "condition",
  async setup(ctx) {
    const reactor = await ctx.reactor();
    if (!reactor) return;
    // The registry-typed client goes in as it is, no cast.
    const drive = await ensureDrive(reactor.client, pointed);
    expectTypeOf(drive).toEqualTypeOf<{
      id: string;
      name: string;
      deferred?: boolean;
    }>();
  },
  async poll() {
    return null;
  },
});

// Both views of the one client fit what ensureDrive calls.
expectTypeOf<IReactorClient>().toExtend<EnsureDriveClient>();
expectTypeOf<
  TypedReactorClient<typeof registry>
>().toExtend<EnsureDriveClient>();

async function checkPlainClient(client: IReactorClient) {
  await ensureDrive(client, pointed);
}

void checkModuleTakers;
void checkPlainClient;
