import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useShell } from "../shell/state.js";
import { useProjectRoot } from "./provider.js";

/** The absolute path of `file`, which is relative to the project's `root`. */
export const projectFilePath = (root: string, file: string) =>
  `${root.replace(/[\\/]+$/, "")}/${file}`;

/** Undefined until the project's root is known. */
export function useOpenInEditor(): ((file: string) => void) | undefined {
  const root = useProjectRoot();
  const { openInEditorUrl, app } = useShell().host;
  if (root === undefined) return undefined;
  return (file) => {
    const failed = () => {
      const message = `Could not open ${file} in your editor`;
      if (app.notifyError) app.notifyError(message);
      else console.error(message);
    };
    fetch(openInEditorUrl(projectFilePath(root, file))).then((response) => {
      if (!response.ok) failed();
    }, failed);
  };
}

/** A file's path as a quiet link that opens the file in the editor. */
export function FileLink({
  file,
  children,
  className,
}: {
  file: string;
  children?: ReactNode;
  className?: string;
}) {
  const open = useOpenInEditor();
  return (
    <button
      type="button"
      data-testid="ph-open-file"
      data-file={file}
      title={`Open ${file} in your editor`}
      disabled={!open}
      onClick={() => open?.(file)}
      className={cn(
        "min-w-0 cursor-pointer truncate text-left font-mono text-[12px] underline decoration-transparent underline-offset-[3px] hover:decoration-foreground/40",
        className,
      )}
    >
      {children ?? file}
    </button>
  );
}
