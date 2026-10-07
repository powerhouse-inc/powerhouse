// @vitest-environment happy-dom
import type {
  IInspector,
  InspectorDocumentModelInfo,
} from "@powerhousedao/reactor";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModulesTab } from "./ModulesTab.js";

/**
 * The Modules tab lists a reactor's registered document models with versions
 * (multi-reactor §2). It reads the same `IInspector.listDocumentModels`
 * surface for every hosting kind, so these stub the inspector directly.
 */
function stubInspector(models: InspectorDocumentModelInfo[]): IInspector {
  return {
    listDocumentModels: () => Promise.resolve(models),
  } as unknown as IInspector;
}

const MODELS: InspectorDocumentModelInfo[] = [
  {
    documentType: "powerhouse/document-drive",
    name: "DocumentDrive",
    version: 1,
    supportedVersions: [1],
  },
  {
    documentType: "sky/ledger",
    name: "Ledger",
    version: 2,
    supportedVersions: [1, 2],
  },
];

describe("ModulesTab", () => {
  it("lists each registered model with its versions", async () => {
    const view = render(<ModulesTab inspector={stubInspector(MODELS)} />);

    await waitFor(() => {
      expect(view.getAllByTestId("modules-row")).toHaveLength(2);
    });
    const counts = view.getByTestId("modules-counts");
    expect(counts.textContent).toContain("Registered models: 2");

    const rows = view.getAllByTestId("modules-row");
    // Sorted by document type: document-drive before sky/ledger.
    expect(rows[0]!.textContent).toContain("powerhouse/document-drive");
    expect(rows[0]!.textContent).toContain("DocumentDrive");
    expect(rows[1]!.textContent).toContain("sky/ledger");
    expect(rows[1]!.textContent).toContain("1, 2");
  });

  it("reports an empty registry rather than hanging on Loading", async () => {
    const view = render(<ModulesTab inspector={stubInspector([])} />);

    await waitFor(() => {
      expect(view.container.textContent).toContain(
        "No document models registered.",
      );
    });
  });

  it("surfaces a read failure instead of a silent blank", async () => {
    const inspector = {
      listDocumentModels: vi.fn(() => Promise.reject(new Error("boom"))),
    } as unknown as IInspector;
    const view = render(<ModulesTab inspector={inspector} />);

    await waitFor(() => {
      expect(view.container.textContent).toContain("boom");
    });
  });
});
