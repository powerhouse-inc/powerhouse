import {
  reducer,
  setManagedBy,
  setWorkflowName,
  utils,
  type WorkflowAction,
  type WorkflowDocument,
} from "document-models/workflow/v1";
import { describe, expect, it } from "vitest";

function apply(
  document: WorkflowDocument,
  ...actions: WorkflowAction[]
): WorkflowDocument {
  return actions.reduce(
    (current, action) => reducer(current, action),
    document,
  );
}

describe("SET_MANAGED_BY", () => {
  it("starts unmanaged", () => {
    expect(utils.createDocument().state.global.managedBy).toBeNull();
  });

  it("marks who keeps the workflow without making a draft edit, and clears it", () => {
    let doc = apply(utils.createDocument(), setWorkflowName({ name: "Cal" }));
    const version = doc.state.global.version;
    doc = apply(
      doc,
      setManagedBy({
        documentId: "integration-1",
        documentType: "sektar/integration",
        label: "Powerhouse - Google Calendar",
      }),
    );
    expect(doc.operations.global.at(-1)?.error).toBeFalsy();
    expect(doc.state.global.managedBy).toEqual({
      documentId: "integration-1",
      documentType: "sektar/integration",
      label: "Powerhouse - Google Calendar",
    });
    // Not an edit of the workflow: nothing to publish
    expect(doc.state.global.version).toBe(version);

    // Only the document: the rest reads as empty
    doc = apply(doc, setManagedBy({ documentId: "integration-2" }));
    expect(doc.state.global.managedBy).toEqual({
      documentId: "integration-2",
      documentType: "",
      label: "",
    });

    doc = apply(doc, setManagedBy({}));
    expect(doc.state.global.managedBy).toBeNull();
  });
});
