import { DocumentModelRegistry } from "@powerhousedao/reactor";
import type {
  DocumentModelLib,
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  documentModelDocumentModelModule,
  inspectableDefinition,
} from "document-model";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  FIXTURE_PACKAGE_NAME,
  materializeLoaderPackage,
  type MaterializedPackage,
} from "../../document-model/test/fixtures/loaders/materialize.js";
import { setVetraPackageManager } from "../src/hooks/vetra-packages.js";
import { WorkerPackageLoader } from "../src/rpc/worker-package-loader.js";
import {
  fakePackageManager,
  stubConnectWindow,
} from "./utils/package-manager.js";

/**
 * A model loaded through the worker loader must inspect exactly like one
 * imported directly, with the same version and origin, so the report does not
 * depend on how the host booted.
 */

const DOCUMENT_TYPE = "test/ledger";

let fixture: MaterializedPackage;
let direct: DocumentModelModule[];
let throughWorker: DocumentModelModule[];

beforeAll(async () => {
  fixture = materializeLoaderPackage();
  const load = async (root: string, subpath: string) =>
    (
      (await import(
        /* @vite-ignore */
        pathToFileURL(join(root, subpath)).href
      )) as { documentModels: DocumentModelModule[] }
    ).documentModels;

  direct = await load(fixture.root, "document-models/index.ts");

  const loader = new WorkerPackageLoader({
    cdnUrl: "https://cdn.example/",
    importPackage: () =>
      import(
        /* @vite-ignore */
        pathToFileURL(join(fixture.root, "browser/document-models/index.ts"))
          .href
      ) as Promise<Record<string, unknown>>,
    resolvePackages: () => Promise.resolve([FIXTURE_PACKAGE_NAME]),
  });
  throughWorker = await loader.loadPackages([FIXTURE_PACKAGE_NAME]);
});

afterAll(() => {
  fixture.dispose();
});

function versionOf(
  modules: readonly DocumentModelModule[],
  version: number,
): DocumentModelModule {
  return modules.find((module) => (module.version ?? 1) === version)!;
}

describe("inspection through either loading path", () => {
  it.each([1, 2])("agrees about version %i", (version) => {
    const fromDirect = inspectableDefinition(versionOf(direct, version));
    const fromWorker = inspectableDefinition(versionOf(throughWorker, version));
    expect(fromWorker).toStrictEqual(fromDirect);
    // The selected module's own version, not the package's latest.
    expect(fromDirect!.version).toBe(version);
    expect(fromDirect!.documentType).toBe(DOCUMENT_TYPE);
    expect(fromDirect!.authoring).toStrictEqual({
      mode: "code-first",
      writableThroughDocumentActions: false,
    });
  });
});

describe("a mixed package set", () => {
  let registry: DocumentModelRegistry;
  let restoreWindow: () => void;

  beforeEach(() => {
    registry = new DocumentModelRegistry();
    restoreWindow = stubConnectWindow(registry);
    const packages: DocumentModelLib[] = [
      {
        documentModels: direct,
        editors: [],
        upgradeManifests: [],
      } as unknown as DocumentModelLib,
      {
        documentModels: [documentModelDocumentModelModule],
        editors: [],
        upgradeManifests: [],
      } as unknown as DocumentModelLib,
    ];
    setVetraPackageManager(fakePackageManager(packages));
  });

  afterEach(() => {
    restoreWindow();
  });

  it("reports a compiled definition for the code-first model only", () => {
    expect(registry.getSupportedVersions(DOCUMENT_TYPE)).toEqual([1, 2]);
    expect(
      inspectableDefinition(registry.getModule(DOCUMENT_TYPE, 2)),
    ).toMatchObject({ documentType: DOCUMENT_TYPE, version: 2 });
    expect(
      inspectableDefinition(registry.getModule("powerhouse/document-model")),
    ).toBeNull();
  });

  it("keeps the code-first model's own documents editable", () => {
    const module = registry.getModule(DOCUMENT_TYPE, 2) as DocumentModelModule;
    const utils = module as unknown as {
      utils: { createDocument: () => PHDocument };
      actions: Record<string, (input: unknown) => unknown>;
      reducer: (document: PHDocument, action: unknown) => PHDocument;
    };
    const document = utils.reducer(
      utils.utils.createDocument(),
      utils.actions.addAmount({ amount: 7 }),
    );
    expect(
      (document.state as unknown as { global: { total: number } }).global.total,
    ).toBe(7);
    expect(
      document.operations.global.filter(
        (operation) => operation.error !== undefined,
      ),
    ).toEqual([]);
  });
});
