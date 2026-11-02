# File drops in an editor

Use this only when the editor accepts dropped files of its own (images, PDFs, CSVs, attachments). Most editors don't need it.

Connect wraps every editor in an outer drop zone that handles Powerhouse document files only (`.phd`, `.phdm`, `.zip`). To accept other files, use `useEditorFileDrop` from `@powerhousedao/reactor-browser`. Its `dragProps` carry the handlers and a marker attribute that makes the outer drop zone leave the subtree alone.

```tsx
import { useEditorFileDrop } from "@powerhousedao/reactor-browser";

export default function Editor() {
  const { dragProps, isDragOver } = useEditorFileDrop({
    accept: [".png", ".jpg", ".jpeg", ".pdf"],
    onFiles: (files) => handleFiles(files),
  });

  return (
    <div {...dragProps} className="relative">
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <p className="text-foreground text-base font-medium">
            Drop files to attach
          </p>
        </div>
      )}
      {/* ... editor content ... */}
    </div>
  );
}
```

- `accept` lists lowercase extensions with the dot. Without it, every file is accepted.
- `onFiles` gets only the files that match `accept`.
- The overlay must have `pointer-events-none`. Otherwise it takes the `drop` event and `onFiles` never runs.

If the upload function lives in a child component's React context (e.g. `usePromptInputAttachments().add` inside a `PromptInput`), bridge it with a ref: a small component inside that context stores the function in a ref, and `onFiles` calls `ref.current?.(files)`.
