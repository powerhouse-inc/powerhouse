// @vitest-environment happy-dom

import { PackagesTab } from "@powerhousedao/connect-core/views";
import { createPHStore, PHStoreProvider } from "@powerhousedao/reactor-browser";
import type { DocumentModelLib } from "@powerhousedao/shared/document-model";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BrowserPackageManager } from "../package-manager.js";

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(cleanup);

// Connect's own package manager in the store, as boot sets it.
async function mountTab(genericChrome: boolean) {
  const pm = new BrowserPackageManager("test", null);
  await pm.init(undefined, undefined, false, false, genericChrome);
  const store = createPHStore();
  store.vetraPackageManager = pm;
  render(
    <PHStoreProvider store={store}>
      <PackagesTab />
    </PHStoreProvider>,
  );
  return pm;
}

describe("core's Packages tab over Connect's package manager", () => {
  it("lists the built-in package's document models, without the generic chrome's editors", async () => {
    await mountTab(false);
    const common = screen.getByRole("listitem", { name: "Common" });
    expect(within(common).getByText("built-in")).toBeTruthy();
    const models = within(common).getByRole("table", {
      name: "Common document models",
    });
    expect(within(models).getByText("powerhouse/document-drive")).toBeTruthy();
    expect(
      within(common).queryByRole("table", { name: "Common editors" }),
    ).toBeNull();
    expect(
      within(common).queryByRole("table", { name: "Common drive apps" }),
    ).toBeNull();
  });

  it("lists common's editors and drive app with the generic chrome", async () => {
    await mountTab(true);
    const common = screen.getByRole("listitem", { name: "Common" });
    const apps = within(common).getByRole("table", {
      name: "Common drive apps",
    });
    expect(within(apps).getByText("GenericDriveExplorer")).toBeTruthy();
    expect(
      within(common).getByRole("table", { name: "Common editors" }),
    ).toBeTruthy();
  });

  it("shows a package added at runtime", async () => {
    const pm = await mountTab(false);
    expect(screen.queryByRole("listitem", { name: "@acme/models" })).toBeNull();
    const pkg = {
      manifest: { name: "@acme/models" },
      documentModels: [documentModelDocumentModelModule],
      editors: [],
    } as unknown as DocumentModelLib;
    act(() => pm.addLocalPackage("@acme/models", pkg, "0.4.0"));
    const entry = await screen.findByRole("listitem", { name: "@acme/models" });
    expect(within(entry).getByText("0.4.0")).toBeTruthy();
    expect(within(entry).getByText("powerhouse/document-model")).toBeTruthy();
  });
});
