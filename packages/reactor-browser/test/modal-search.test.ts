import { describe, expect, it } from "vitest";
import {
  isRoutedModal,
  modalFromSearch,
  modalSearch,
  withoutModalSearch,
} from "../src/hooks/modals.js";

describe("routed modals", () => {
  it("round-trips a modal and its fields through the query", () => {
    const modal = {
      type: "createDocument",
      documentType: "powerhouse/todo",
      documentModelVersion: 2,
    } as const;
    const search = modalSearch(modal);
    expect(search).toEqual({
      modal: "create-document",
      documentType: "powerhouse/todo",
      documentModelVersion: "2",
    });
    expect(modalFromSearch(search!)).toEqual(modal);
    const inDrive = { ...modal, driveId: "inventory" };
    expect(modalSearch(inDrive)).toMatchObject({ driveId: "inventory" });
    expect(modalFromSearch(modalSearch(inDrive)!)).toEqual(inDrive);
    expect(modalFromSearch({ modal: "drive-settings", driveId: "d1" })).toEqual(
      { type: "driveSettings", driveId: "d1" },
    );
  });

  it("leaves confirmations and unknown ids out of the URL", () => {
    expect(modalSearch({ type: "deleteItem", id: "n1" })).toBeUndefined();
    expect(isRoutedModal({ type: "deleteItem", id: "n1" })).toBe(false);
    expect(isRoutedModal({ type: "login" })).toBe(true);
    expect(modalFromSearch({ modal: "nope" })).toBeUndefined();
    expect(modalFromSearch({ page: "2" })).toBeUndefined();
  });

  it("drops only the open modal's params", () => {
    expect(
      withoutModalSearch({
        modal: "create-document",
        documentType: "powerhouse/todo",
        history: "",
      }),
    ).toEqual({ history: "" });
  });
});
