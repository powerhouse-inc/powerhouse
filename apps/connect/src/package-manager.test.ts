// @vitest-environment happy-dom
import vetraPkg from "@powerhousedao/vetra/package.json" with { type: "json" };
import workflowPkg from "@powerhousedao/workflow/package.json" with { type: "json" };
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BrowserPackageManager,
  sharedDepMismatchWarnings,
} from "./package-manager.js";
import {
  declareExternalPackagesLayer,
  LAYER_ORDER,
  mountPackageStyles,
} from "./package-styles.js";

// Both packages are reached through a lazy `import()`, so the fake stands in
// for the code-split chunk without pulling either package's editors in here.
vi.mock("@powerhousedao/vetra", () => ({
  manifest: { name: "@powerhousedao/vetra" },
  documentModels: [],
  editors: [],
}));

vi.mock("@powerhousedao/workflow", () => ({
  manifest: { name: "@powerhousedao/workflow" },
  documentModels: [],
  editors: [],
}));

const VETRA = "@powerhousedao/vetra";
const WORKFLOW = "@powerhousedao/workflow";

const HOST_VERSIONS = {
  "document-model": "1.4.0",
  "reactor-browser": "3.2.1",
  "design-system": "2.0.0",
};

describe("sharedDepMismatchWarnings", () => {
  it("returns nothing when the host has no version table or the package.json is missing", () => {
    // A dev / vendor-off host has no table to compare against, and an
    // unfetchable package.json means the check cannot run — both are
    // silent, never a warning.
    expect(
      sharedDepMismatchWarnings(
        { peerDependencies: { "reactor-browser": ">=9.0.0" } },
        null,
      ),
    ).toEqual([]);
    expect(sharedDepMismatchWarnings(null, HOST_VERSIONS)).toEqual([]);
  });

  it("flags only the shared-dep ranges the host version does not satisfy", () => {
    const warnings = sharedDepMismatchWarnings(
      {
        // "document-model" is satisfied by the host (>=1.0.0 vs 1.4.0) and
        // "left-pad" is not a shared dep — both must stay out of the output.
        peerDependencies: {
          "reactor-browser": ">=9.0.0",
          "document-model": ">=1.0.0",
        },
        dependencies: { "left-pad": "^1.0.0" },
      },
      HOST_VERSIONS,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("reactor-browser");
    expect(warnings[0]).toContain(">=9.0.0");
    expect(warnings[0]).toContain("3.2.1");
  });
});

describe("BrowserPackageManager.init — flag-gated local packages", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function manager() {
    return new BrowserPackageManager("test", null);
  }

  it("registers neither vetra nor workflow with both flags off", async () => {
    const pm = manager();
    await pm.init(undefined, undefined, false, false);
    expect(pm.getPackageSource(VETRA)).toBeNull();
    expect(pm.getPackageSource(WORKFLOW)).toBeNull();
  });

  it("registers the workflow package by manifest name and package.json version when the flag is on", async () => {
    const pm = manager();
    await pm.init(undefined, undefined, false, true);
    expect(pm.getPackageSource(WORKFLOW)).toBe("common");
    expect(pm.getPackageVersion(WORKFLOW)).toBe(workflowPkg.version);
  });

  it("does not register workflow for studio mode alone", async () => {
    const pm = manager();
    await pm.init(undefined, undefined, true, false);
    expect(pm.getPackageSource(VETRA)).toBe("common");
    expect(pm.getPackageVersion(VETRA)).toBe(vetraPkg.version);
    expect(pm.getPackageSource(WORKFLOW)).toBeNull();
  });

  it("does not register vetra for workflows alone", async () => {
    const pm = manager();
    await pm.init(undefined, undefined, false, true);
    expect(pm.getPackageSource(VETRA)).toBeNull();
  });

  it("registers both when both flags are on", async () => {
    const pm = manager();
    await pm.init(undefined, undefined, true, true);
    expect(pm.getPackageSource(VETRA)).toBe("common");
    expect(pm.getPackageSource(WORKFLOW)).toBe("common");
  });
});

describe("declareExternalPackagesLayer", () => {
  it("declares the layer before any stylesheet, once", () => {
    // Stands in for the project's stylesheet, already in <head>.
    document.head.innerHTML = '<meta name="project-stylesheet" />';
    declareExternalPackagesLayer();
    declareExternalPackagesLayer();
    const first = document.head.firstElementChild;
    expect(first?.tagName).toBe("STYLE");
    expect(first?.textContent).toBe(LAYER_ORDER);
    expect(document.head.querySelectorAll("style")).toHaveLength(1);
  });
});

describe("mountPackageStyles", () => {
  it("imports the CSS into the external-packages layer, replacing on update", () => {
    document.head.innerHTML = '<meta name="project-stylesheet" />';
    mountPackageStyles("umh-production-ledger", ".a{color:red}");
    mountPackageStyles("umh-production-ledger", ".a{color:blue}");
    const styles = document.head.querySelectorAll(
      "style[data-ph-package-styles]",
    );
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toMatch(
      /^@import url\("blob:.+"\) layer\(external-packages\);$/,
    );
    // The order is declared before everything else.
    expect(document.head.firstElementChild?.textContent).toBe(LAYER_ORDER);
  });
});
