import { act, type DragEvent } from "react";
import { describe, expect, it, vi, type Mock } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useEditorFileDrop } from "../src/hooks/use-editor-file-drop.js";

type FakeEvent = {
  event: DragEvent<Element>;
  preventDefault: Mock;
  stopPropagation: Mock;
};

function fakeEvent(opts: { types?: string[]; files?: File[] }): FakeEvent {
  const { types = ["Files"], files = [] } = opts;
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event = {
    preventDefault,
    stopPropagation,
    dataTransfer: {
      types,
      files: Object.assign(files, {
        length: files.length,
      }) as unknown as FileList,
    },
  } as unknown as DragEvent<Element>;
  return { event, preventDefault, stopPropagation };
}

describe("useEditorFileDrop", () => {
  it("includes the opt-out attribute in dragProps", () => {
    const { result } = renderHook(() =>
      useEditorFileDrop({ onFiles: () => undefined }),
    );
    expect(result.current.dragProps["data-accepts-files"]).toBe("");
  });

  it("preventDefaults dragover for file drags only", () => {
    const onFiles = vi.fn();
    const { result } = renderHook(() => useEditorFileDrop({ onFiles }));

    const dragOver = fakeEvent({});
    result.current.dragProps.onDragOver(dragOver.event);
    expect(dragOver.preventDefault).toHaveBeenCalledTimes(1);

    const ui = fakeEvent({ types: ["UI_NODE"] });
    result.current.dragProps.onDragOver(ui.event);
    expect(ui.preventDefault).not.toHaveBeenCalled();
  });

  it("filters dropped files by extension and skips when none match", () => {
    const onFiles = vi.fn();
    const { result } = renderHook(() =>
      useEditorFileDrop({ accept: [".png", ".pdf"], onFiles }),
    );

    const pic = new File([""], "photo.PNG");
    const doc = new File([""], "spec.pdf");
    const bad = new File([""], "notes.txt");

    result.current.dragProps.onDrop(
      fakeEvent({ files: [pic, doc, bad] }).event,
    );
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0]).toEqual([pic, doc]);

    onFiles.mockClear();
    result.current.dragProps.onDrop(fakeEvent({ files: [bad] }).event);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("treats accept entries case-insensitively", () => {
    const onFiles = vi.fn();
    const { result } = renderHook(() =>
      useEditorFileDrop({ accept: [".PNG", ".PDF"], onFiles }),
    );

    const pic = new File([""], "photo.png");
    const doc = new File([""], "spec.PDF");

    result.current.dragProps.onDrop(fakeEvent({ files: [pic, doc] }).event);
    expect(onFiles).toHaveBeenCalledWith([pic, doc]);
  });

  it("tracks drag depth so the overlay does not flicker on child crossings", () => {
    const { result } = renderHook(() =>
      useEditorFileDrop({ onFiles: () => undefined }),
    );

    expect(result.current.isDragOver).toBe(false);

    act(() => result.current.dragProps.onDragEnter(fakeEvent({}).event));
    expect(result.current.isDragOver).toBe(true);

    act(() => result.current.dragProps.onDragEnter(fakeEvent({}).event));
    expect(result.current.isDragOver).toBe(true);

    act(() => result.current.dragProps.onDragLeave(fakeEvent({}).event));
    expect(result.current.isDragOver).toBe(true);

    act(() => result.current.dragProps.onDragLeave(fakeEvent({}).event));
    expect(result.current.isDragOver).toBe(false);
  });

  it("resets depth on drop", () => {
    const { result } = renderHook(() =>
      useEditorFileDrop({ onFiles: () => undefined }),
    );

    act(() => result.current.dragProps.onDragEnter(fakeEvent({}).event));
    act(() => result.current.dragProps.onDragEnter(fakeEvent({}).event));
    act(() => result.current.dragProps.onDrop(fakeEvent({}).event));
    expect(result.current.isDragOver).toBe(false);

    act(() => result.current.dragProps.onDragLeave(fakeEvent({}).event));
    expect(result.current.isDragOver).toBe(false);
  });
});
