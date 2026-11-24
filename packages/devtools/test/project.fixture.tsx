import { act, render, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import type {
  DevtoolsApiErrorCode,
  ProjectApp,
  ProjectCheck,
  ProjectFileList,
  ProjectDocumentModel,
  ProjectDocumentModelDetail,
  ProjectEditor,
  ProjectFile,
  ProjectFileText,
  ProjectProcessor,
  ProjectSnapshot,
  ProjectSubgraph,
} from "../src/api.js";
import { BUILD_GROUP, BUILD_PANELS } from "../src/build/pages/index.js";
import { ProjectProvider } from "../src/build/project/provider.js";
import type { DevtoolsApp } from "../src/props.js";
import type { Registry } from "../src/shell/registry.js";
import { DevtoolsStandalone } from "../src/shell/root.js";
import { focusOf, seedView } from "./storage.fixture.js";

export const API = "/__ph/devtools/api";
export const ROOT = "/home/dev/acme";

export const BUILD_REGISTRY: Registry = {
  groups: [BUILD_GROUP],
  panels: BUILD_PANELS as Registry["panels"],
  Provider: ProjectProvider,
};

const pass = (id: ProjectCheck["id"], label: string): ProjectCheck => ({
  id,
  state: "pass",
  label,
});

const file = (path: string): ProjectFile => ({ path });

const MODEL_CHECKS = [
  pass("definition", "Definition passes the document model checks"),
  pass("registered", "Registered in document-models/document-models.ts"),
  pass("manifest", "Listed in powerhouse.manifest.json"),
];

export const INVOICE: ProjectDocumentModel = {
  documentType: "acme/invoice",
  name: "Invoice",
  extension: ".inv",
  description: "An invoice with line items and a payment status.",
  author: "Acme",
  authorWebsite: "https://acme.dev",
  layout: "stored",
  source: "document-models/invoice/invoice.json",
  folder: "document-models/invoice",
  versions: [1],
  modules: 2,
  operations: 4,
  checks: MODEL_CHECKS,
};

export const CUSTOMER: ProjectDocumentModel = {
  documentType: "acme/customer",
  name: "Customer",
  extension: ".cust",
  description: "A customer invoices are sent to.",
  author: "Acme",
  authorWebsite: null,
  layout: "stored",
  source: "document-models/customer/customer.json",
  folder: "document-models/customer",
  versions: [1],
  modules: 1,
  operations: 2,
  checks: MODEL_CHECKS,
};

export const INVOICE_EDITOR: ProjectEditor = {
  id: "invoice-editor",
  name: "Invoice Editor",
  folder: "editors/invoice-editor",
  documentTypes: ["acme/invoice"],
  checks: [
    pass("registered", "Registered in editors/editors.ts"),
    pass("manifest", "Listed in powerhouse.manifest.json"),
  ],
};

/** An editor whose code exists but that Connect does not load. */
export const CUSTOMER_EDITOR: ProjectEditor = {
  id: "customer-editor",
  name: "Customer Editor",
  folder: "editors/customer-editor",
  documentTypes: ["acme/customer"],
  checks: [
    {
      id: "registered",
      state: "warn",
      label: "Not registered in editors/editors.ts",
      detail: "Connect does not load it. Run ph generate editor --all.",
    },
    {
      ...pass("manifest", "Listed in powerhouse.manifest.json"),
      detail: "Shown only if the check stops passing.",
    },
  ],
};

export const SUBGRAPH_SDL = `"""
InvoiceStats Subgraph Queries
"""
type InvoiceStatsSubgraphQueries {
  example(driveId: String!): String
}

type Query {
  invoiceStats: InvoiceStatsSubgraphQueries!
}`;

export const BILLING: ProjectApp = {
  id: "billing",
  name: "Billing",
  folder: "editors/billing",
  documentTypes: ["powerhouse/document-drive"],
  allowedDocumentTypes: ["acme/invoice", "acme/customer"],
  dragAndDrop: true,
  checks: [
    pass("registered", "Registered in editors/editors.ts"),
    pass("manifest", "Listed in powerhouse.manifest.json"),
  ],
};

export const INVOICE_STATS: ProjectSubgraph = {
  name: "invoice-stats",
  folder: "subgraphs/invoice-stats",
  style: "schema-first",
  schema: { source: SUBGRAPH_SDL, file: "subgraphs/invoice-stats/schema.ts" },
  queries: ["invoiceStats.example(driveId: String!): String"],
  mutations: [],
  checks: [pass("registered", "Registered in subgraphs/index.ts")],
};

export const INVOICE_TOTALS: ProjectProcessor = {
  name: "invoice-totals",
  folder: "processors/invoice-totals",
  type: "analytics",
  apps: ["connect", "switchboard"],
  documentTypes: ["acme/invoice"],
  checks: [
    pass("registered", "Registered in processors/connect.ts"),
    pass("document-types", "Its document types are in this project"),
  ],
};

/** The playground project: two models, an editor, a drive app, a subgraph and
 * a processor, all in step. */
export function snapshot(
  parts: Partial<ProjectSnapshot> = {},
): ProjectSnapshot {
  return {
    revision: "r1",
    root: ROOT,
    documentModels: { ok: true, items: [INVOICE, CUSTOMER] },
    editors: { ok: true, items: [INVOICE_EDITOR] },
    apps: { ok: true, items: [BILLING] },
    subgraphs: { ok: true, items: [INVOICE_STATS] },
    processors: { ok: true, items: [INVOICE_TOTALS] },
    diagnostics: [],
    ...parts,
  };
}

export function invoiceDetail(
  parts: Partial<ProjectDocumentModelDetail> = {},
): ProjectDocumentModelDetail {
  return {
    ...INVOICE,
    revision: "r1",
    specifications: [
      {
        version: 1,
        changeLog: [],
        state: {
          global: {
            schema:
              "type InvoiceState {\n  number: String\n  customer: String\n  status: InvoiceStatus!\n  items: [LineItem!]!\n}\n\nenum InvoiceStatus {\n  DRAFT\n  ISSUED\n  PAID\n}\n\ntype LineItem {\n  id: OID!\n  description: String!\n  quantity: Int!\n  unitPrice: Float!\n}",
            initialValue:
              '{\n  "number": null,\n  "customer": null,\n  "status": "DRAFT",\n  "items": []\n}',
          },
          local: null,
        },
        modules: [
          {
            id: "a261dbd7",
            name: "items",
            description: "",
            operations: [
              {
                id: "0e8b1b9a",
                name: "ADD_LINE_ITEM",
                scope: "global",
                description: "Adds a line item to the invoice.",
                schema:
                  "input AddLineItemInput {\n  id: OID!\n  description: String!\n  quantity: Int!\n  unitPrice: Float!\n}",
                errors: [],
                examples: [],
              },
              {
                id: "a78ff59a",
                name: "REMOVE_LINE_ITEM",
                scope: "global",
                description: "Removes a line item by its id.",
                schema: "input RemoveLineItemInput {\n  id: OID!\n}",
                errors: [
                  {
                    name: "LineItemNotFound",
                    code: "LINE_ITEM_NOT_FOUND",
                    description: "No line item has that id.",
                  },
                ],
                examples: ['{\n  "id": "item-1"\n}'],
              },
            ],
          },
          {
            id: "5d1f0c2e",
            name: "details",
            description: "",
            operations: [
              {
                id: "c41a7e10",
                name: "SET_CUSTOMER",
                scope: "global",
                description: "Sets who the invoice is for.",
                schema: "input SetCustomerInput {\n  customer: String!\n}",
                errors: [],
                examples: [],
              },
              {
                id: "9b3e55d2",
                name: "SET_STATUS",
                scope: "global",
                description: "Moves the invoice to another status.",
                schema: "",
                errors: [],
                examples: [],
              },
            ],
          },
        ],
      },
    ],
    ...parts,
  };
}

export function customerDetail(): ProjectDocumentModelDetail {
  return {
    ...CUSTOMER,
    revision: "r1",
    specifications: [
      {
        version: 1,
        changeLog: [],
        state: {
          global: {
            schema: "type CustomerState {\n  name: String\n  email: String\n}",
            initialValue: '{\n  "name": null,\n  "email": null\n}',
          },
          local: null,
        },
        modules: [
          {
            id: "7c0d1f55",
            name: "profile",
            description: "",
            operations: [
              {
                id: "1f6a2b90",
                name: "SET_CUSTOMER_NAME",
                scope: "global",
                description: "Sets the customer's name.",
                schema: "input SetCustomerNameInput {\n  name: String!\n}",
                errors: [],
                examples: [],
              },
            ],
          },
        ],
      },
    ],
  };
}

export function fileList(
  parts: Partial<ProjectFileList> = {},
): ProjectFileList {
  return {
    revision: "r1",
    modules: [
      {
        folder: "editors/invoice-editor",
        files: [
          file("editors/invoice-editor/editor.tsx"),
          file("editors/invoice-editor/module.ts"),
          file("editors/invoice-editor/ui/line-items.tsx"),
        ],
      },
      {
        folder: "editors/billing",
        files: [
          file("editors/billing/config.ts"),
          file("editors/billing/editor.tsx"),
          file("editors/billing/module.ts"),
        ],
      },
      {
        folder: "subgraphs/invoice-stats",
        files: [
          file("subgraphs/invoice-stats/index.ts"),
          file("subgraphs/invoice-stats/resolvers.ts"),
          file("subgraphs/invoice-stats/schema.ts"),
        ],
      },
      {
        folder: "processors/invoice-totals",
        files: [
          file("processors/invoice-totals/factory.ts"),
          file("processors/invoice-totals/index.ts"),
          file("processors/invoice-totals/processor.ts"),
        ],
      },
    ],
    ...parts,
  };
}

/** What the fake dev server answers. Change it between polls. */
export type ProjectServer = {
  /** Absent: this dev server does not read the project. */
  snapshot?: ProjectSnapshot;
  details: Record<string, ProjectDocumentModelDetail>;
  fileList?: ProjectFileList;
  /** The text the files route answers, by path. A path without one is not
   * found. */
  files: Partial<Record<string, { text: string; truncated?: boolean }>>;
  /** Every project route fails with this while set. `hang` never answers. */
  failure?: ApiFailure | "network" | "hang";
  /** Routes that fail on their own, by route: `project/files`,
   * `project/document-models/acme%2Finvoice`. */
  routeFailures?: Record<string, ApiFailure>;
};

type ApiFailure = { code: DevtoolsApiErrorCode; message: string };

export function projectServer(
  parts: Partial<ProjectServer> = {},
): ProjectServer {
  return {
    snapshot: snapshot(),
    details: {
      "acme/invoice": invoiceDetail(),
      "acme/customer": customerDetail(),
    },
    fileList: fileList(),
    files: {
      "editors/invoice-editor/editor.tsx": {
        text: 'export default function Editor() {\n  return "invoice";\n}\n',
      },
      "editors/invoice-editor/module.ts": {
        text: 'export const module = { id: "invoice-editor" };\n',
      },
    },
    ...parts,
  };
}

const apiError = (code: DevtoolsApiErrorCode, message: string) =>
  Response.json(
    { error: { code, message } },
    { status: code === "not_found" ? 404 : 500 },
  );

const MODEL_ROUTE = "project/document-models/";
const FILE_ROUTE = "project/files/";

export function addToken() {
  const meta = document.createElement("meta");
  meta.name = "ph-devtools-token";
  meta.content = "token";
  document.head.append(meta);
}

/** Stubs `fetch` with the DevTools API of `server`, read at each request. */
export function serveProject(server: ProjectServer) {
  addToken();
  const fetchMock = vi.fn((...[input, init]: Parameters<typeof fetch>) => {
    const url = String(input);
    if (url.includes("__open-in-editor")) {
      return Promise.resolve(new Response(null, { status: 200 }));
    }
    const route = url.startsWith(`${API}/`) ? url.slice(API.length + 1) : "";
    if (server.failure === "network") {
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    if (server.failure === "hang") {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      });
    }
    const routeFailure = server.routeFailures?.[route];
    if (routeFailure) {
      return Promise.resolve(apiError(routeFailure.code, routeFailure.message));
    }
    if (server.failure) {
      return Promise.resolve(
        apiError(server.failure.code, server.failure.message),
      );
    }
    const notFound = apiError("not_found", `No DevTools route "${route}".`);
    if (!server.snapshot) return Promise.resolve(notFound);
    const etag = `"${server.snapshot.revision}"`;
    const answer = (body: unknown) =>
      Promise.resolve(
        body === undefined
          ? notFound
          : Response.json(body, { headers: { ETag: etag } }),
      );
    if (route === "project") {
      if (new Headers(init?.headers).get("if-none-match") === etag) {
        return Promise.resolve(new Response(null, { status: 304 }));
      }
      return answer(server.snapshot);
    }
    if (route === "project/files") return answer(server.fileList);
    if (route.startsWith(MODEL_ROUTE)) {
      const type = decodeURIComponent(route.slice(MODEL_ROUTE.length));
      return answer(server.details[type]);
    }
    if (route.startsWith(FILE_ROUTE)) {
      const path = decodeURIComponent(route.slice(FILE_ROUTE.length));
      const found = server.files[path];
      const listed = server.fileList?.modules.some((module) =>
        module.files.some((listedFile) => listedFile.path === path),
      );
      return answer(
        found &&
          listed &&
          ({
            revision: server.snapshot.revision,
            path,
            text: found.text,
            truncated: found.truncated ?? false,
          } satisfies ProjectFileText),
      );
    }
    return Promise.resolve(notFound);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The requests `fetchMock` got for one API route. */
export const requestsTo = (
  fetchMock: ReturnType<typeof serveProject>,
  route: string,
) => fetchMock.mock.calls.filter(([url]) => String(url) === `${API}/${route}`);

/** The standalone page on `panel`, focused on `focus` (`kind:id`), in an app
 * that offers `app`. */
export function renderDevtools(
  panel: string,
  focus?: string,
  app?: DevtoolsApp,
): RenderResult {
  window.history.replaceState(null, "", "/__ph/devtools");
  seedView({
    open: false,
    target: { panel, ...(focus && { focus: focusOf(focus) }) },
  });
  return render(<DevtoolsStandalone app={app} registry={BUILD_REGISTRY} />);
}

/** Polls at once, as coming back to the tab does. */
export function pollNow() {
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
