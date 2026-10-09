import {
  createReactorInspector,
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import {
  actions,
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRoutingClient,
  CrossBackendRelationshipError,
  fromReactorClient,
  type RoutableBackendConfig,
  type RoutingClientOptions,
  type RoutingReactorClient,
} from "../src/index.js";

function causeNames(error: unknown): string[] {
  const names: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    names.push(current.name);
    current = current.cause;
  }
  return names;
}

async function inProcessReactor(): Promise<InProcessReactorClientModule> {
  const builder = new ReactorBuilder().withDocumentModelSources([
    driveDocumentModelModule as unknown as DocumentModelModule,
    documentModelDocumentModelModule,
  ]);
  return new ReactorClientBuilder()
    .withReactorBuilder(builder)
    .withCreateSignaturePolicy("legacy")
    .buildModule();
}

function backend(
  name: string,
  module: InProcessReactorClientModule,
): RoutableBackendConfig {
  const reactorModule = module.reactorModule;
  if (reactorModule === undefined) {
    throw new Error("expected an in-process reactor module");
  }
  return {
    name,
    backend: fromReactorClient(module.client),
    facts: () => createReactorInspector(reactorModule).info(),
    reach: { hosting: "in-process", inspection: "direct" },
    refusesMisroutes: false,
  };
}

describe("routing over real in-process reactors", () => {
  let alpha: InProcessReactorClientModule;
  let beta: InProcessReactorClientModule;
  let backends: RoutableBackendConfig[];
  let driveA = "";
  let driveB = "";

  function router(
    options: RoutingClientOptions = {},
  ): Promise<RoutingReactorClient> {
    return createRoutingClient(backends, {
      onDiagnostic: () => {},
      ...options,
    });
  }

  beforeAll(async () => {
    alpha = await inProcessReactor();
    beta = await inProcessReactor();
    backends = [backend("alpha", alpha), backend("beta", beta)];
    driveA = (await alpha.client.drives.create({ global: { name: "Alpha" } }))
      .header.id;
    driveB = (await beta.client.drives.create({ global: { name: "Beta" } }))
      .header.id;
    await alpha.client.drives.addFolder(driveA, "alpha-folder");
    await beta.client.drives.addFolder(driveB, "beta-folder");
  });

  afterAll(async () => {
    await alpha.reactor.kill().completed;
    await beta.reactor.kill().completed;
  });

  it("reads each reactor's own facts", async () => {
    const client = await router();

    expect(client.backends.map((entry) => entry.facts.known)).toEqual([
      true,
      true,
    ]);
    expect(client.backends[0].facts.reactor.storage.engine).toBe("pglite");
  });

  it("keeps each drive's operations on the reactor that holds it", async () => {
    const client = await router({
      collections: { [driveA]: "alpha", [driveB]: "beta" },
    });

    await client.drives.addFolder(driveA, "routed-into-alpha");
    await client.drives.addFolder(driveB, "routed-into-beta");

    const onAlpha = await alpha.client.get<DocumentDriveDocument>(driveA);
    const onBeta = await beta.client.get<DocumentDriveDocument>(driveB);
    expect(onAlpha.state.global.nodes.map((node) => node.name)).toContain(
      "routed-into-alpha",
    );
    expect(onBeta.state.global.nodes.map((node) => node.name)).toContain(
      "routed-into-beta",
    );
    await expect(beta.client.get(driveA)).rejects.toThrow();
    await expect(alpha.client.get(driveB)).rejects.toThrow();
  });

  it("merges a find across both reactors", async () => {
    const client = await router();

    const page = await client.find({ type: "powerhouse/document-drive" });

    expect(page.results.map((document) => document.header.id)).toEqual(
      expect.arrayContaining([driveA, driveB]),
    );
  });

  it("lands a write on the owning reactor from a WRONG table, exactly once", async () => {
    const reported: string[] = [];
    const client = await router({
      collections: { [driveA]: "beta", [driveB]: "alpha" },
      onDiagnostic: (message) => reported.push(message),
    });
    const before = await alpha.client.get<DocumentDriveDocument>(driveA);

    await client.drives.addFolder(driveA, "recovered-folder");

    const after = await alpha.client.get<DocumentDriveDocument>(driveA);
    const names = after.state.global.nodes.map((node) => node.name);
    expect(names.filter((name) => name === "recovered-folder")).toHaveLength(1);
    expect(after.state.global.nodes).toHaveLength(
      before.state.global.nodes.length + 1,
    );
    await expect(beta.client.get(driveA)).rejects.toThrow();
    expect(reported.join()).toMatch(/is stale/);
  });

  it("recovers a READ aimed at the wrong reactor", async () => {
    const client = await router({ documents: { [driveA]: "beta" } });

    const drive = await client.get<DocumentDriveDocument>(driveA);

    expect(drive.state.global.name).toBe("Alpha");
  });

  it("refuses a relationship write that would cross reactors", async () => {
    const client = await router();

    await expect(
      client.addRelationship(driveA, driveB, "child"),
    ).rejects.toThrow(CrossBackendRelationshipError);
  });

  it("creates a child on the parent drive's reactor and routes it afterwards", async () => {
    const client = await router();

    const created = await client.createEmpty("powerhouse/document-model", {
      parentIdentifier: driveB,
    });

    await expect(client.get(created.header.id)).resolves.toBeTruthy();
    await expect(beta.client.get(created.header.id)).resolves.toBeTruthy();
    await expect(alpha.client.get(created.header.id)).rejects.toThrow();
  });

  it("adds a file to a drive through the backend's own drive client", async () => {
    const client = await router();
    const document = withSignaturePolicy(
      documentModelDocumentModelModule.utils.createDocument(),
      "legacy",
    );

    const added = await client.drives.addFile(driveB, document);

    const drive = await beta.client.get<DocumentDriveDocument>(driveB);
    expect(drive.state.global.nodes.map((node) => node.id)).toContain(
      added.header.id,
    );
  });

  it("rejects a colliding addFile with DocumentAlreadyExistsError on its cause", async () => {
    const client = await router();
    const document = withSignaturePolicy(
      documentModelDocumentModelModule.utils.createDocument(),
      "legacy",
    );
    await client.drives.addFile(driveB, document);

    const error: unknown = await client.drives.addFile(driveB, document).then(
      () => undefined,
      (rejected: unknown) => rejected,
    );

    expect(causeNames(error)).toContain("DocumentAlreadyExistsError");
  });

  it("renames and upgrades through derived calls", async () => {
    const client = await router();
    const created = await client.createEmpty("powerhouse/document-model", {
      parentIdentifier: driveA,
    });

    const renamed = await client.rename(created.header.id, "renamed");
    const upgraded = await client.upgradeDocument(created.header.id);

    expect(renamed.header.name).toBe("renamed");
    expect(upgraded.header.id).toBe(created.header.id);
  });

  it("submits executeAsync without waiting and reports a failed job as FAILED", async () => {
    const client = await router();

    const submitted = await client.executeAsync("never-created", "main", [
      actions.setName("x"),
    ]);
    const settled = await client.waitForJob(submitted);

    expect(settled.status).toBe("FAILED");
    expect(settled.error?.name).toBe("DocumentNotFoundError");
  });

  it("answers a failed job as FAILED on a backend without submit", async () => {
    const { submit: _submit, ...waiting } = fromReactorClient(alpha.client);
    const client = await createRoutingClient(
      [{ ...backends[0], backend: waiting }],
      { onDiagnostic: () => {} },
    );

    const submitted = await client.executeAsync("never-created", "main", [
      actions.setName("x"),
    ]);

    expect(submitted.status).toBe("FAILED");
    expect(submitted.error?.name).toBe("DocumentNotFoundError");
  });
});
