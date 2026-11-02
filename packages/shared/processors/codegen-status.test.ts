import { describe, expect, it } from "vitest";
import {
  CodegenStatusRegistry,
  getCodegenStatusRegistry,
} from "./codegen-status.js";

const job = {
  documentId: "model-1",
  documentType: "powerhouse/document-model",
};

describe("CodegenStatusRegistry", () => {
  it("is active once a codegen processor watches document types", () => {
    const status = new CodegenStatusRegistry();
    expect(status.active).toBe(false);

    status.watch([job.documentType]);

    expect(status.active).toBe(true);
    expect(status.watches(job.documentType)).toBe(true);
    expect(status.watches("powerhouse/document-drive")).toBe(false);
  });

  it("keeps a document's name across states, and only the latest files", () => {
    const status = new CodegenStatusRegistry();
    status.set({ ...job, name: "Reading List", state: "running" });
    status.set({ ...job, state: "done", files: ["a.ts"] });

    status.set({ ...job, state: "queued" });

    const { updatedAt, ...queued } = status.get(job.documentId)!;
    expect(queued).toStrictEqual({
      ...job,
      name: "Reading List",
      state: "queued",
    });
    expect(Date.parse(updatedAt)).not.toBeNaN();
  });

  it("is settled when every job is done, failed or skipped", () => {
    const status = new CodegenStatusRegistry();
    status.set({ ...job, state: "done" });
    status.set({ ...job, documentId: "model-2", state: "waiting-for-install" });

    expect(status.settled(job.documentId)).toBe(true);
    expect(status.settled("model-2")).toBe(false);
    expect(status.settled()).toBe(false);
    expect(status.settled("unknown")).toBe(true);
  });

  it("clears a package's load failure when it loads", () => {
    const status = new CodegenStatusRegistry();
    status.reportLoad("@acme/reading", "document models", "boom");
    status.reportLoad("@acme/reading", "subgraphs", "boom");

    status.reportLoad("@acme/reading", "document models");

    expect(
      status.loadFailures().map(({ updatedAt: _, ...failure }) => failure),
    ).toStrictEqual([
      { package: "@acme/reading", kind: "subgraphs", message: "boom" },
    ]);
  });

  it("is one registry per process", () => {
    expect(getCodegenStatusRegistry()).toBe(getCodegenStatusRegistry());
  });
});
