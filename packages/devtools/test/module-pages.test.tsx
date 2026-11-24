// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectFilePath } from "../src/build/project/open-in-editor.js";
import { resolveHost, type DevtoolsApp } from "../src/props.js";
import {
  BILLING,
  CUSTOMER_EDITOR,
  INVOICE_EDITOR,
  INVOICE_STATS,
  INVOICE_TOTALS,
  pollNow,
  projectServer,
  renderDevtools,
  requestsTo,
  ROOT,
  serveProject,
  snapshot,
  SUBGRAPH_SDL,
  type ProjectServer,
} from "./project.fixture.js";
import { clearStorage, savedView } from "./storage.fixture.js";

/** What the app loaded in this tab. */
const APP: DevtoolsApp = {
  loadedModules: { editors: ["invoice-editor"], apps: ["billing"] },
};

let server: ProjectServer;
let fetchMock: ReturnType<typeof serveProject>;

beforeEach(() => {
  clearStorage();
  server = projectServer();
  fetchMock = serveProject(server);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

const detail = () => screen.getByTestId("ph-module-detail");
const header = () => detail().querySelector("header")?.textContent;
const facts = () => screen.getByTestId("ph-module-facts").textContent;
const rows = () =>
  screen
    .getAllByTestId("ph-module-row")
    .map((row) => `${row.dataset.moduleId}:${row.dataset.state}`);
const rowText = () =>
  screen.getAllByTestId("ph-module-row").map((row) => row.textContent);
const tabs = () =>
  screen
    .getAllByTestId("ph-module-tab")
    .map((tab) => `${tab.dataset.tab}:${tab.textContent}`);
const tab = (id: string) =>
  screen.getAllByTestId("ph-module-tab").find((t) => t.dataset.tab === id)!;
const selectedTab = () =>
  screen
    .getAllByRole("tab")
    .find((t) => t.getAttribute("aria-selected") === "true")?.dataset.tab;
const checks = () =>
  screen
    .getAllByTestId("ph-check")
    .map((check) => `${check.dataset.tone}:${check.textContent}`);
const problems = () =>
  screen
    .queryAllByTestId("ph-module-problem")
    .map((problem) => `${problem.dataset.tone}:${problem.textContent}`);
const treeFiles = () =>
  within(screen.getByTestId("ph-files"))
    .getAllByTestId("ph-file")
    .map(
      (file) =>
        `${file.textContent}${file.getAttribute("aria-selected") === "true" ? " (selected)" : ""}`,
    );
const fileView = () => screen.getByTestId("ph-file-view");
const click = (element: Element) => {
  act(() => {
    fireEvent.click(element);
  });
};
const key = (element: Element, name: string) => {
  act(() => {
    fireEvent.keyDown(element, { key: name });
  });
};
const filter = (text: string) => {
  act(() => {
    fireEvent.change(screen.getByTestId("ph-module-filter"), {
      target: { value: text },
    });
  });
};

async function open(panel: string, focus?: string) {
  renderDevtools(panel, focus, APP);
  await waitFor(() => expect(tab("files").textContent).toMatch(/^Files\d+$/));
}

async function openFiles() {
  click(tab("files"));
  await waitFor(() =>
    expect(within(fileView()).queryByText("Reading…")).toBeNull(),
  );
}

const withCustomerEditor = () =>
  snapshot({
    editors: { ok: true, items: [INVOICE_EDITOR, CUSTOMER_EDITOR] },
  });

describe("Build › Editors", () => {
  it("lists the editors beside the first one's overview", async () => {
    await open("editors");
    expect(rows()).toEqual(["invoice-editor:pass"]);
    expect(rowText()).toEqual(["Invoice Editoracme/invoice"]);
    expect(header()).toBe("Invoice Editor");
    expect(detail().dataset.moduleId).toBe("invoice-editor");
    expect(tabs()).toEqual([
      "overview:Overview",
      "files:Files3",
      "checks:Checks✓",
    ]);
    expect(selectedTab()).toBe("overview");
    expect(problems()).toEqual([]);
    expect(screen.getByTestId("ph-checks-pass").textContent).toBe(
      "All 3 checks pass",
    );
    expect(facts()).toBe(
      "IDinvoice-editor" +
        "Document typesacme/invoice→ Invoice" +
        "Drive appsBilling" +
        "Foldereditors/invoice-editor/",
    );
    expect(tab("files").textContent).toBe("Files3");
  });

  it("copies the module's id", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    await open("editors");
    click(within(screen.getByTestId("ph-module-facts")).getByTestId("ph-copy"));
    expect(writeText).toHaveBeenCalledWith("invoice-editor");
  });

  it("puts what to fix first, then sends to every check", async () => {
    server.snapshot = withCustomerEditor();
    await open("editors");
    expect(rows()).toEqual(["invoice-editor:pass", "customer-editor:warn"]);
    expect(
      screen.getAllByTestId("ph-module-row")[1].lastElementChild?.textContent,
    ).toBe("1");

    click(screen.getAllByTestId("ph-module-row")[1]);

    expect(savedView().focus).toBe("module:customer-editor");
    expect(detail().dataset.moduleId).toBe("customer-editor");
    expect(tab("checks").textContent).toBe("Checks1");
    expect(problems()).toEqual([
      "warn:Not registered in editors/editors.tsConnect does not load it. Run ph generate editor --all.",
    ]);
    expect(screen.getByTestId("ph-checks-more").textContent).toBe(
      "1 more check passes · See all",
    );
    expect(tab("files").textContent).toBe("Files0");

    click(within(screen.getByTestId("ph-checks-more")).getByRole("button"));
    expect(selectedTab()).toBe("checks");
    expect(checks()).toEqual([
      "warn:Not registered in editors/editors.tsConnect does not load it. Run ph generate editor --all.",
      "ok:Listed in powerhouse.manifest.json",
      "idle:Not loaded in this tab",
    ]);
  });

  it("opens every check from the chip that says they pass", async () => {
    await open("editors");
    click(screen.getByTestId("ph-checks-pass"));
    expect(selectedTab()).toBe("checks");
    expect(checks()).toEqual([
      "ok:Registered in editors/editors.ts",
      "ok:Listed in powerhouse.manifest.json",
      "ok:Loaded in this tab",
    ]);
  });

  it("leaves the loaded check out in an app that cannot tell what it loaded", async () => {
    renderDevtools("editors");
    await waitFor(() => expect(tab("files").textContent).toMatch(/^Files\d+$/));
    click(screen.getByTestId("ph-checks-pass"));
    expect(checks()).toEqual([
      "ok:Registered in editors/editors.ts",
      "ok:Listed in powerhouse.manifest.json",
    ]);
  });

  it("narrows the list to the editors the filter matches", async () => {
    server.snapshot = withCustomerEditor();
    await open("editors");

    filter("CUSTOMER-ed");
    expect(rows()).toEqual(["customer-editor:warn"]);
    // The selected editor stays in the detail while the filter hides it.
    expect(detail().dataset.moduleId).toBe("invoice-editor");

    filter("acme/invoice");
    expect(rows()).toEqual(["invoice-editor:pass"]);

    filter("ledger");
    expect(screen.queryAllByTestId("ph-module-row")).toEqual([]);
    const none = screen.getByTestId("ph-modules-no-match");
    expect(none.textContent).toContain("No editor matches “ledger”");
    click(within(none).getByRole("button", { name: "Clear the search" }));
    expect(rows()).toEqual(["invoice-editor:pass", "customer-editor:warn"]);
  });

  it("copies the command that creates an editor", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    await open("editors");
    const [inList, inTitle] = screen.getAllByTestId("ph-module-new");
    expect(inTitle.getAttribute("aria-label")).toBe(
      inList.getAttribute("aria-label"),
    );
    expect(inList.textContent).toBe("");
    expect(inList.getAttribute("aria-label")).toBe(
      "New editor: copy ph generate editor --name <name> --document-type <type>",
    );
    click(inList);
    expect(writeText).toHaveBeenCalledWith(
      "ph generate editor --name <name> --document-type <type>",
    );
    await waitFor(() =>
      expect(inList.getAttribute("aria-label")).toBe("Copied"),
    );
  });

  it("keeps the tab while another editor is chosen, and moves with the keys", async () => {
    server.snapshot = withCustomerEditor();
    await open("editors");

    click(tab("checks"));
    click(screen.getAllByTestId("ph-module-row")[1]);
    expect(detail().dataset.moduleId).toBe("customer-editor");
    expect(selectedTab()).toBe("checks");

    key(tab("checks"), "Home");
    expect(selectedTab()).toBe("overview");
    expect(document.activeElement).toBe(tab("overview"));
    key(tab("overview"), "ArrowRight");
    expect(selectedTab()).toBe("files");
    expect(document.activeElement).toBe(tab("files"));
    key(tab("files"), "End");
    expect(selectedTab()).toBe("checks");
    key(tab("checks"), "ArrowRight");
    expect(selectedTab()).toBe("overview");
    key(tab("overview"), "ArrowLeft");
    expect(selectedTab()).toBe("checks");

    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(tab("checks").id);
    expect(tab("checks").getAttribute("tabindex")).toBe("0");
    expect(tab("overview").getAttribute("tabindex")).toBe("-1");
  });

  it("shows the text of the first file, and of the file chosen next", async () => {
    await open("editors");
    await openFiles();

    expect(treeFiles()).toEqual([
      "editor.tsx (selected)",
      "module.ts",
      "line-items.tsx",
    ]);
    expect(screen.getByTestId("ph-files").textContent).toContain("ui");
    expect(fileView().dataset.path).toBe("editors/invoice-editor/editor.tsx");
    expect(fileView().querySelector("pre")?.textContent).toBe(
      'export default function Editor() {\n  return "invoice";\n}\n',
    );

    click(within(screen.getByTestId("ph-files")).getAllByTestId("ph-file")[1]);
    await waitFor(() =>
      expect(fileView().querySelector("pre")?.textContent).toBe(
        'export const module = { id: "invoice-editor" };\n',
      ),
    );
    expect(fileView().dataset.path).toBe("editors/invoice-editor/module.ts");
    expect(
      requestsTo(
        fetchMock,
        `project/files/${encodeURIComponent("editors/invoice-editor/module.ts")}`,
      ),
    ).toHaveLength(1);
  });

  it("says a file's text is cut short, or why it could not be read", async () => {
    server.files["editors/invoice-editor/editor.tsx"] = {
      text: "x".repeat(2048),
      truncated: true,
    };
    await open("editors");
    await openFiles();
    expect(screen.getByTestId("ph-file-truncated").textContent).toBe(
      "Showing the first 2 KB.",
    );

    click(within(screen.getByTestId("ph-files")).getAllByTestId("ph-file")[2]);
    await waitFor(() =>
      expect(screen.getByTestId("ph-file-error").textContent).toBe(
        `No DevTools route "project/files/${encodeURIComponent("editors/invoice-editor/ui/line-items.tsx")}".`,
      ),
    );
  });

  it("opens the chosen file in the developer's editor", async () => {
    await open("editors");
    await openFiles();
    click(within(fileView()).getByRole("button", { name: /Open in editor/ }));
    expect(fetchMock).toHaveBeenCalledWith(
      `/__open-in-editor?file=${encodeURIComponent(`${ROOT}/editors/invoice-editor/editor.tsx`)}`,
    );
  });

  it("counts the modules with a problem beside the page's name", async () => {
    server.snapshot = withCustomerEditor();
    await open("editors");
    // The second of each pair is the wide nav's item, the one with a label.
    const nav = (panel: string) =>
      document.querySelectorAll(`button[data-panel="${panel}"]`)[1].textContent;
    expect(nav("editors")).toBe("Editors1");
    expect(nav("apps")).toBe("Drive Apps");
  });

  it("selects the module the saved view names, and links its document type to the model", async () => {
    server.snapshot = withCustomerEditor();
    await open("editors", "module:customer-editor");
    expect(detail().dataset.moduleId).toBe("customer-editor");

    click(screen.getByTestId("ph-document-type-link"));
    expect(savedView().panel).toBe("models");
    expect(savedView().focus).toBe("model:acme/customer");
  });

  it("links the drive apps that can hold the editor's documents", async () => {
    await open("editors");
    click(screen.getByTestId("ph-module-link"));
    expect(savedView().panel).toBe("apps");
    expect(savedView().focus).toBe("module:billing");
  });

  it("names no drive app when none can hold the editor's documents", async () => {
    server.snapshot = snapshot({
      apps: {
        ok: true,
        items: [{ ...BILLING, allowedDocumentTypes: ["acme/customer"] }],
      },
    });
    await open("editors");
    expect(facts()).not.toContain("Drive apps");

    server.snapshot = snapshot({
      revision: "r2",
      apps: { ok: true, items: [{ ...BILLING, allowedDocumentTypes: [] }] },
    });
    pollNow();
    await waitFor(() => expect(facts()).toContain("Drive appsBilling"));
  });

  it("switches editors from the title where the list has no room", async () => {
    server.snapshot = withCustomerEditor();
    await open("editors");
    click(tab("checks"));

    click(screen.getByTestId("ph-module-switcher"));
    const options = await screen.findAllByTestId("ph-module-option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Invoice Editoracme/invoice",
      "Customer Editoracme/customer1",
    ]);

    fireEvent.change(screen.getByTestId("ph-module-search"), {
      target: { value: "customer" },
    });
    await waitFor(() =>
      expect(
        screen
          .queryAllByTestId("ph-module-option")
          .map((option) => option.dataset.moduleId),
      ).toEqual(["customer-editor"]),
    );
    click(screen.getByTestId("ph-module-option"));

    await waitFor(() =>
      expect(detail().dataset.moduleId).toBe("customer-editor"),
    );
    expect(screen.getByTestId("ph-module-switcher").textContent).toBe(
      "Customer Editor",
    );
    expect(selectedTab()).toBe("checks");
  });

  it("matches part of a name, id or line in the title's search, not scattered letters", async () => {
    server.snapshot = withCustomerEditor();
    await open("editors");
    click(screen.getByTestId("ph-module-switcher"));
    fireEvent.change(await screen.findByTestId("ph-module-search"), {
      target: { value: "ice" },
    });
    await waitFor(() =>
      expect(
        screen
          .queryAllByTestId("ph-module-option")
          .map((option) => option.dataset.moduleId),
      ).toEqual(["invoice-editor"]),
    );
  });

  it("says when no editor matches the title's search", async () => {
    server.snapshot = withCustomerEditor();
    await open("editors");
    click(screen.getByTestId("ph-module-switcher"));
    fireEvent.change(await screen.findByTestId("ph-module-search"), {
      target: { value: "nothing like it" },
    });
    await waitFor(() =>
      expect(screen.queryAllByTestId("ph-module-option")).toEqual([]),
    );
    expect(screen.getByText("No editor matches.")).toBeTruthy();
  });

  it("has a plain title when the project has one editor", async () => {
    await open("editors");
    expect(screen.queryByTestId("ph-module-switcher")).toBeNull();
    expect(header()).toBe("Invoice Editor");
  });

  it("tells two modules that state the same id apart by folder", async () => {
    const copy = { ...INVOICE_EDITOR, folder: "editors/invoice-editor-copy" };
    server.snapshot = snapshot({
      editors: { ok: true, items: [INVOICE_EDITOR, copy] },
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await open("editors", "module:invoice-editor");

    const listed = screen.getAllByTestId("ph-module-row");
    expect(listed.map((row) => row.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
    ]);
    expect(facts()).toContain("Foldereditors/invoice-editor/");
    expect(tab("files").textContent).toBe("Files3");

    fireEvent.click(listed[1]);
    await waitFor(() =>
      expect(facts()).toContain("Foldereditors/invoice-editor-copy/"),
    );
    expect(
      screen
        .getAllByTestId("ph-module-row")
        .map((row) => row.getAttribute("aria-selected")),
    ).toEqual(["false", "true"]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("shows a new editor when the project's code changes", async () => {
    await open("editors");
    server.snapshot = { ...withCustomerEditor(), revision: "r2" };
    pollNow();
    await waitFor(() =>
      expect(rows()).toEqual(["invoice-editor:pass", "customer-editor:warn"]),
    );
  });

  it("says how to create the first editor", async () => {
    server.snapshot = snapshot({ editors: { ok: true, items: [] } });
    renderDevtools("editors", undefined, APP);
    const empty = await screen.findByTestId("ph-kind-empty");
    expect(empty.textContent).toContain("No editors in this project");
    expect(empty.textContent).toContain(
      "An editor renders the documents of one document model in Connect.",
    );
    expect(within(empty).getByTestId("ph-command").textContent).toContain(
      "ph generate editor --name <name> --document-type <type>",
    );
  });

  it("shows why the editors could not be read in place of the list", async () => {
    server.snapshot = snapshot({
      editors: { ok: false, message: "editors/editors.ts: Unexpected token" },
    });
    renderDevtools("editors", undefined, APP);
    const error = await screen.findByTestId("ph-section-error");
    expect(error.getAttribute("role")).toBe("alert");
    expect(error.textContent).toContain("Could not read the editors");
    expect(error.textContent).toContain("editors/editors.ts: Unexpected token");
    expect(screen.queryByTestId("ph-module-row")).toBeNull();
  });

  it("shows the API's message when the project cannot be read", async () => {
    server.failure = { code: "internal", message: "EACCES: /home/dev/acme" };
    renderDevtools("editors", undefined, APP);
    const unavailable = await screen.findByTestId("ph-project-unavailable");
    expect(unavailable.dataset.code).toBe("internal");
    expect(unavailable.textContent).toContain(
      "The DevTools API answered with an error",
    );
    expect(unavailable.textContent).toContain("EACCES: /home/dev/acme");
  });

  it("says the dev server is down while it cannot be reached, and recovers", async () => {
    server.failure = "network";
    renderDevtools("editors", undefined, APP);
    const unavailable = await screen.findByTestId("ph-project-unavailable");
    expect(unavailable.dataset.code).toBe("unreachable");
    expect(unavailable.textContent).toContain(
      "The dev server is not answering",
    );
    expect(unavailable.textContent).toContain("Failed to fetch");

    server.failure = undefined;
    pollNow();
    await screen.findByTestId("ph-module-detail");
  });

  it("asks for a reload when the server refuses the page's token", async () => {
    server.failure = {
      code: "bad_token",
      message: "The token does not match.",
    };
    renderDevtools("editors", undefined, APP);
    const unavailable = await screen.findByTestId("ph-project-unavailable");
    expect(unavailable.textContent).toContain("The dev server restarted");
    expect(within(unavailable).getByTestId("ph-reload").textContent).toBe(
      "Reload the page",
    );
  });

  it("shows why the files could not be read, and keeps the rest", async () => {
    server.fileList = undefined;
    renderDevtools("editors", undefined, APP);
    const message = 'No DevTools route "project/files".';
    click(await waitFor(() => tab("files")));
    await waitFor(() =>
      expect(screen.getByTestId("ph-module-files").textContent).toBe(message),
    );
    expect(tab("files").textContent).toBe("Files");
    click(tab("checks"));
    expect(checks()).toHaveLength(3);
  });
});

describe("Build › Drive Apps", () => {
  it("shows what the drive app opens and allows", async () => {
    await open("apps");
    expect(screen.getByRole("listbox").getAttribute("aria-label")).toBe(
      "Drive Apps",
    );
    expect(rowText()).toEqual(["Billingopens powerhouse/document-drive"]);
    expect(facts()).toBe(
      "IDbilling" +
        "Openspowerhouse/document-drive" +
        "Allowed typesacme/invoice→ Invoiceacme/customer→ Customer" +
        "Drag and dropon" +
        "Foldereditors/billing/",
    );
    click(tab("checks"));
    expect(checks().at(-1)).toBe("ok:Loaded in this tab");
  });

  it("says what its config does not state", async () => {
    server.snapshot = snapshot({
      apps: {
        ok: true,
        items: [
          {
            ...BILLING,
            documentTypes: [],
            allowedDocumentTypes: null,
            dragAndDrop: null,
          },
        ],
      },
    });
    await open("apps");
    expect(rowText()).toEqual(["Billing"]);
    expect(facts()).toContain("Allowed typesnot read from config.ts");
    expect(facts()).toContain("Drag and dropnot read from config.ts");
  });

  it("says a drive app with an empty list allows every type", async () => {
    server.snapshot = snapshot({
      apps: {
        ok: true,
        items: [
          {
            ...BILLING,
            documentTypes: [],
            allowedDocumentTypes: [],
            dragAndDrop: false,
          },
          {
            ...BILLING,
            id: "ledger",
            name: "Ledger",
            folder: "editors/ledger",
            documentTypes: [],
          },
        ],
      },
    });
    await open("apps");
    expect(rowText()).toEqual(["Billingevery type", "Ledger2 allowed types"]);
    expect(facts()).toContain("Allowed typesevery type");
    expect(facts()).toContain("Drag and dropoff");
  });

  it("says how to create the first drive app", async () => {
    server.snapshot = snapshot({ apps: { ok: true, items: [] } });
    renderDevtools("apps", undefined, APP);
    const empty = await screen.findByTestId("ph-kind-empty");
    expect(empty.textContent).toContain("No drive apps in this project");
    expect(empty.textContent).toContain("ph generate app --name <name>");
  });
});

describe("Build › Subgraphs", () => {
  it("shows a subgraph's endpoint, its operations and its SDL", async () => {
    await open("subgraphs");
    expect(rowText()).toEqual(["invoice-stats/graphql/invoice-stats"]);
    expect(header()).toBe("invoice-stats");
    expect(tabs()).toEqual([
      "overview:Overview",
      "schema:Schema",
      "files:Files3",
      "checks:Checks✓",
    ]);
    expect(facts()).toBe(
      "Endpoint/graphql/invoice-stats" +
        "Queries1" +
        "Mutations0" +
        "Foldersubgraphs/invoice-stats/",
    );

    click(tab("schema"));
    expect(
      screen
        .getAllByTestId("ph-operation")
        .map((op) => `${op.dataset.type}:${op.textContent}`),
    ).toEqual(["query:QinvoiceStats.example(driveId: String!): String"]);
    const schema = screen.getByTestId("ph-subgraph-schema");
    expect(schema.querySelector("pre")?.textContent).toBe(SUBGRAPH_SDL);
    expect(schema.querySelector("pre span")).not.toBeNull();
    expect(within(schema).getByTestId("ph-open-file").dataset.file).toBe(
      "subgraphs/invoice-stats/schema.ts",
    );
  });

  it("says a subgraph without SDL has its schema built when the module runs", async () => {
    server.snapshot = snapshot({
      subgraphs: {
        ok: true,
        items: [
          {
            ...INVOICE_STATS,
            style: "code-first",
            schema: null,
            queries: [],
            mutations: [],
          },
        ],
      },
    });
    await open("subgraphs");
    expect(facts()).toContain("Queriesknown when the module runs");
    click(tab("schema"));
    expect(screen.getByTestId("ph-subgraph-schema").textContent).toBe(
      "Its schema is built when the module runs.",
    );
  });

  it("says how to create the first subgraph", async () => {
    server.snapshot = snapshot({ subgraphs: { ok: true, items: [] } });
    renderDevtools("subgraphs", undefined, APP);
    const empty = await screen.findByTestId("ph-kind-empty");
    expect(empty.textContent).toContain("No subgraphs in this project");
    expect(empty.textContent).toContain("ph generate subgraph --name <name>");
  });
});

describe("Build › Processors", () => {
  it("shows a processor's type, where it runs and its document types", async () => {
    await open("build-processors");
    expect(rowText()).toEqual([
      "invoice-totalsanalytics · Connect, Switchboard",
    ]);
    expect(screen.getByTestId("ph-processor-type").textContent).toBe(
      "analytics",
    );
    expect(facts()).toBe(
      "Typeanalytics" +
        "Runs inConnect · Switchboard" +
        "Document typesacme/invoice→ Invoice" +
        "Folderprocessors/invoice-totals/",
    );
    expect(tab("files").textContent).toBe("Files3");
  });

  it("says what the code does not state", async () => {
    server.snapshot = snapshot({
      processors: {
        ok: true,
        items: [
          {
            ...INVOICE_TOTALS,
            type: null,
            apps: ["switchboard"],
            documentTypes: ["acme/order"],
          },
        ],
      },
    });
    await open("build-processors");
    expect(rowText()).toEqual(["invoice-totalsSwitchboard"]);
    expect(screen.getByTestId("ph-processor-type").textContent).toBe(
      "not stated in code",
    );
    expect(facts()).toContain("Document typesacme/order");
    expect(screen.queryByTestId("ph-document-type-link")).toBeNull();
  });

  it("says how to create the first processor", async () => {
    server.snapshot = snapshot({ processors: { ok: true, items: [] } });
    renderDevtools("build-processors", undefined, APP);
    const empty = await screen.findByTestId("ph-kind-empty");
    expect(empty.textContent).toContain("No processors in this project");
    expect(empty.textContent).toContain("ph generate processor --name <name>");
  });
});

describe("opening a file in the editor", () => {
  it("names the file by its absolute path, whatever the root ends with", () => {
    expect(projectFilePath("/home/dev/acme/", "editors/a b.tsx")).toBe(
      "/home/dev/acme/editors/a b.tsx",
    );
    expect(projectFilePath("C:\\dev\\acme\\", "editors/a.tsx")).toBe(
      "C:\\dev\\acme/editors/a.tsx",
    );
  });

  it.each([
    [undefined, "/__open-in-editor"],
    ["/", "/__open-in-editor"],
    ["/app/", "/app/__open-in-editor"],
  ])("asks Vite's route below the base path %s", (base, route) => {
    expect(
      resolveHost({ base }).openInEditorUrl("/home/dev/acme/editors/a b.tsx"),
    ).toBe(`${route}?file=%2Fhome%2Fdev%2Facme%2Feditors%2Fa%20b.tsx`);
  });

  it("asks the route the host names instead", () => {
    const host = resolveHost({
      openInEditorUrl: (path) => `/open?path=${path}`,
    });
    expect(host.openInEditorUrl("/a.tsx")).toBe("/open?path=/a.tsx");
  });
});
