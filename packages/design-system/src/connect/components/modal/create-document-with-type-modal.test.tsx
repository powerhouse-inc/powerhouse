import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateDocumentWithTypeModal } from "./create-document-with-type-modal.js";

const documentTypes = [
  {
    documentType: "powerhouse/invoice",
    name: "Invoice",
    description: "Billing document",
  },
  { documentType: "powerhouse/todo", name: "To-do List", version: 2 },
];

function setup() {
  const onCreate = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <CreateDocumentWithTypeModal
      documentTypes={documentTypes}
      onCreate={onCreate}
      onOpenChange={onOpenChange}
      open
    />,
  );
  return { onCreate, onOpenChange };
}

function fillName(value: string) {
  fireEvent.change(screen.getByPlaceholderText("Document name"), {
    target: { value },
  });
}

function pickTodoType() {
  // Open the select by clicking the placeholder row, then click the option.
  fireEvent.click(screen.getByText("Select document type…"));
  fireEvent.click(screen.getByText("To-do List v2"));
}

function createButton() {
  return screen.getByRole("button", { name: "Create" });
}

describe("CreateDocumentWithTypeModal", () => {
  it("renders placeholder and a disabled Create button", () => {
    setup();
    expect(screen.getByText("Select document type…")).toBeInTheDocument();
    expect(screen.getByText("Create a new document")).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
  });

  it("does not enable Create with a name but no type", () => {
    setup();
    fillName("My document");
    expect(createButton()).toBeDisabled();
  });

  it("does not enable Create with a type but no name", () => {
    setup();
    pickTodoType();
    expect(createButton()).toBeDisabled();
  });

  it("enables Create with name + type and fires onCreate with the payload", () => {
    const { onCreate } = setup();
    fillName("My document");
    pickTodoType();
    expect(createButton()).toBeEnabled();
    fireEvent.click(createButton());
    expect(onCreate).toHaveBeenCalledWith({
      name: "My document",
      documentType: "powerhouse/todo",
      version: 2,
    });
  });

  it("drops the placeholder from the options once a type is selected", () => {
    setup();
    pickTodoType();
    expect(screen.queryByText("Select document type…")).not.toBeInTheDocument();
  });

  it("shows the error line for a whitespace-only name", () => {
    setup();
    fillName("   ");
    expect(
      screen.getByText(
        "Document name must not be empty or contain control characters.",
      ),
    ).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
  });

  it("versionless options display the bare name and report version undefined", () => {
    const { onCreate } = setup();
    fillName("Inv 1");
    fireEvent.click(screen.getByText("Select document type…"));
    fireEvent.click(screen.getByText("Invoice"));
    fireEvent.click(createButton());
    expect(onCreate).toHaveBeenCalledWith({
      name: "Inv 1",
      documentType: "powerhouse/invoice",
      version: undefined,
    });
  });

  it("cancel closes without firing onCreate", () => {
    const { onCreate, onOpenChange } = setup();
    fillName("My document");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
