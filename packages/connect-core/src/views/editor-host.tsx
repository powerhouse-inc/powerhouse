import type { EditorProps } from "@powerhousedao/shared/document-model";
import type { ErrorInfo, ReactNode } from "react";
import { Component, Suspense } from "react";

/** What core passes a document editor; drive apps get `DriveViewProps`. */
export type DocumentEditorProps = EditorProps & {
  documentId: string;
  context?: { readMode?: boolean; selectedTimelineRevision?: number };
};

type BoundaryProps = {
  resetKeys: readonly unknown[];
  label: string;
  children: ReactNode;
};
type BoundaryState = { error?: unknown; keys: readonly unknown[] };

class EditorErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { keys: this.props.resetKeys };

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { error };
  }

  // A new document or drive gets a fresh try.
  static getDerivedStateFromProps(
    props: BoundaryProps,
    state: BoundaryState,
  ): Partial<BoundaryState> | null {
    const changed =
      props.resetKeys.length !== state.keys.length ||
      props.resetKeys.some((key, i) => !Object.is(key, state.keys[i]));
    return changed ? { error: undefined, keys: props.resetKeys } : null;
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[connect] ${this.props.label} failed:`, error, info);
  }

  override render() {
    const { error } = this.state;
    if (error === undefined) return this.props.children;
    return (
      <div role="alert" className="p-6 text-core-fg">
        <h2 className="font-semibold">The {this.props.label} failed</h2>
        <pre className="mt-2 overflow-x-auto text-sm text-core-muted">
          {error instanceof Error ? error.message : JSON.stringify(error)}
        </pre>
      </div>
    );
  }
}

export type EditorHostProps = {
  /** A change shows the editor again after an error. */
  resetKeys?: readonly unknown[];
  /** Names what failed, e.g. "editor" or "drive app". */
  label?: string;
  children: ReactNode;
};

/** Hosts a drive app or an editor: it loads in Suspense, and an error stays inside. */
export function EditorHost({
  resetKeys = [],
  label = "editor",
  children,
}: EditorHostProps) {
  return (
    <EditorErrorBoundary resetKeys={resetKeys} label={label}>
      <Suspense
        name="EditorHost"
        fallback={
          <p role="status" className="p-6 text-core-muted">
            Loading {label}…
          </p>
        }
      >
        {children}
      </Suspense>
    </EditorErrorBoundary>
  );
}
