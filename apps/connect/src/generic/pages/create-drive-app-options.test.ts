import * as common from "@powerhousedao/powerhouse-vetra-packages";
import type { DocumentModelLib, EditorModule } from "document-model";
import { describe, expect, it } from "vitest";
import {
  appPublisher,
  getCreateDriveAppOptions,
} from "./create-drive-app-options.js";

const genericApp = () =>
  common.editors.find((e) => e.config.id === "GenericDriveExplorer")!;

// Stands in for the vetra package: its two drive apps, by id.
const vetra: DocumentModelLib = {
  manifest: { name: "@powerhousedao/vetra" },
  documentModels: [],
  editors: ["vetra-drive-app", "vetra-explorer"].map((id) => {
    const app = genericApp();
    return { ...app, config: { ...app.config, id, name: id } };
  }),
};

// A project's package with a drive app, as its manifest and module describe it.
function projectPackage(publisher?: string): DocumentModelLib {
  const app = genericApp();
  return {
    manifest: {
      name: "routes-eval",
      publisher: { name: publisher ?? "", url: "" },
    },
    documentModels: [],
    editors: [
      { ...app, config: { ...app.config, id: "todo-app", name: "Todo App" } },
    ],
  };
}

const appsOf = (packages: DocumentModelLib[]) =>
  packages
    .flatMap((pkg) => pkg.editors as EditorModule[])
    .filter((e) => e.documentTypes.includes("powerhouse/document-drive"));

describe("the Create Drive apps' attribution", () => {
  it("credits Powerhouse's own apps to Powerhouse and a project's to its package", () => {
    const packages = [common, vetra, projectPackage()] as DocumentModelLib[];

    const builtBy = Object.fromEntries(
      getCreateDriveAppOptions(appsOf(packages), packages).map((app) => [
        app.id,
        app.builtBy,
      ]),
    );

    expect(builtBy).toEqual({
      "todo-app": "routes-eval",
      GenericDriveExplorer: "Powerhouse",
      "vetra-drive-app": "Powerhouse",
      "vetra-explorer": "Powerhouse",
    });
  });

  it("offers a project's apps first and the vetra drive apps last", () => {
    const packages = [vetra, common, projectPackage()] as DocumentModelLib[];

    expect(
      getCreateDriveAppOptions(appsOf(packages), packages).map((app) => app.id),
    ).toEqual([
      "todo-app",
      "GenericDriveExplorer",
      "vetra-drive-app",
      "vetra-explorer",
    ]);
  });

  it("credits a package's publisher when its manifest names one", () => {
    expect(appPublisher(projectPackage("Acme Inc.").manifest)).toBe(
      "Acme Inc.",
    );
  });

  it("credits a package under the Powerhouse scope to Powerhouse", () => {
    expect(appPublisher({ name: "@powerhousedao/reports" })).toBe("Powerhouse");
  });
});
