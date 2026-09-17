// Keeps a broken document from taking down the studio: a drive node can point
// at a document the reactor no longer serves (deleted, or with unreadable
// history), and the document hooks throw for it. Everything that renders such a
// document goes inside a boundary so the failure stays in that one pane.
import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";

/** Best-effort message for anything thrown, without stringifying an object. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

/** Inline "could not load" panel, also used for hook-level (non-thrown) failures. */
export function DocumentLoadError(props: {
  title?: string;
  label?: string | null;
  documentId?: string | null;
  error: unknown;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="m-3 rounded border border-solid border-red-200 bg-red-50 p-3">
      <p className="text-sm font-medium text-red-700">
        {props.title ?? "This document could not be loaded"}
      </p>
      {props.label ? (
        <p className="mt-0.5 text-xs text-red-600">{props.label}</p>
      ) : null}
      {props.documentId ? (
        <p className="mt-0.5 font-mono text-[11px] text-red-500">
          {props.documentId}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-slate-500">{errorMessage(props.error)}</p>
      <div className="mt-2 flex gap-2">
        {props.onRetry ? (
          <button
            type="button"
            className="rounded border border-solid border-red-300 px-2 py-0.5 text-xs font-medium text-red-600"
            onClick={props.onRetry}
          >
            Retry
          </button>
        ) : null}
        {props.onDismiss ? (
          <button
            type="button"
            className="rounded border border-solid border-slate-300 px-2 py-0.5 text-xs text-slate-600"
            onClick={props.onDismiss}
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}

type Props = {
  /** Human-readable name of the node being rendered, when known. */
  label?: string | null;
  /** Document id, shown so a broken node can be identified in the drive. */
  documentId?: string | null;
  /** Called when the user dismisses the error (e.g. to close the pane). */
  onDismiss?: () => void;
  children: ReactNode;
};

type State = { error: unknown; attempt: number };

export class DocumentErrorBoundary extends Component<Props, State> {
  state: State = { error: undefined, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(
      `Failed to render document ${this.props.documentId ?? "(unknown id)"}:`,
      error,
      info.componentStack,
    );
  }

  private retry = () => {
    this.setState((state) => ({
      error: undefined,
      attempt: state.attempt + 1,
    }));
  };

  private dismiss = () => {
    this.setState({ error: undefined });
    this.props.onDismiss?.();
  };

  render() {
    if (this.state.error !== undefined) {
      return (
        <DocumentLoadError
          label={this.props.label}
          documentId={this.props.documentId}
          error={this.state.error}
          onRetry={this.retry}
          onDismiss={this.props.onDismiss ? this.dismiss : undefined}
        />
      );
    }
    // Remounting on retry drops the failed subtree's state and refetches.
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
