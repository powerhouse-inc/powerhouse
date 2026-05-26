import type { Node } from "@powerhousedao/shared";
import { act, type DragEvent } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { renderHook } from "vitest-browser-react";
import { setIsDragAndDropEnabled } from "../src/hooks/config/editor.js";
import { useDropFile } from "../src/hooks/file-drag-and-drop.js";

type Handlers = ReturnType<typeof useDropFile>;
type FakeEvent = {
  event: DragEvent<Element>;
  preventDefault: Mock;
  stopPropagation: Mock;
};

function fakeEvent(opts: {
  target: Element;
  types?: string[];
  files?: File[];
}): FakeEvent {
  const { target, types = ["Files"], files = [] } = opts;
  const items = files.map((file) => ({
    kind: "file" as const,
    getAsFile: () => file,
  }));
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event = {
    target,
    preventDefault,
    stopPropagation,
    dataTransfer: { types, items, files },
  } as unknown as DragEvent<Element>;
  return { event, preventDefault, stopPropagation };
}

function mountHook(): {
  handlers: Handlers;
  container: HTMLElement;
  result: { current: Handlers };
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const noop = async (): Promise<void> => {
    /* no-op */
  };
  const { result } = renderHook(() =>
    useDropFile(
      noop as (file: File, parent: Node | undefined) => Promise<void>,
    ),
  );
  return { handlers: result.current, container, result };
}

describe("useDropFile", () => {
  beforeEach(() => {
    // Seed the ph global directly — the event-bus handler is only wired up by
    // PHProvider, which we don't mount in these isolated hook tests.
    (window as unknown as { ph?: Record<string, unknown> }).ph = {
      isDragAndDropEnabled: true,
    };
    setIsDragAndDropEnabled(true);
    document.body.innerHTML = "";
  });

  it("stops propagation on a plain file drag-over", () => {
    const { handlers, container } = mountHook();
    const { event, preventDefault, stopPropagation } = fakeEvent({
      target: container,
    });

    handlers.onDragOver(event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("ignores non-file drags (e.g. UI_NODE) so they bubble", () => {
    const { handlers, container } = mountHook();
    const { event, preventDefault, stopPropagation } = fakeEvent({
      target: container,
      types: ["UI_NODE"],
    });

    handlers.onDragOver(event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it("does NOT preventDefault when target is inside [data-accepts-files]", () => {
    const editor = document.createElement("div");
    editor.setAttribute("data-accepts-files", "");
    const inner = document.createElement("span");
    editor.appendChild(inner);
    document.body.appendChild(editor);

    const { handlers } = mountHook();
    const { event, preventDefault, stopPropagation } = fakeEvent({
      target: inner,
    });

    handlers.onDragOver(event);
    handlers.onDrop(event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it("clears the drop target when the cursor enters an opt-out region", async () => {
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    const editor = document.createElement("div");
    editor.setAttribute("data-accepts-files", "");
    document.body.appendChild(editor);

    const { result } = mountHook();

    await act(async () => {
      result.current.onDragOver(fakeEvent({ target: outside }).event);
    });
    expect(result.current.isDropTarget).toBe(true);

    await act(async () => {
      result.current.onDragOver(fakeEvent({ target: editor }).event);
    });
    expect(result.current.isDropTarget).toBe(false);
  });

  it("still claims drops outside any opted-out editor", () => {
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    const { handlers } = mountHook();
    const { event, preventDefault, stopPropagation } = fakeEvent({
      target: outside,
    });

    handlers.onDrop(event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });
});
