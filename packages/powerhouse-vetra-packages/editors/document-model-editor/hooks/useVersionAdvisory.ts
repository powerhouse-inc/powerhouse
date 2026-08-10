import type {
  DocumentModelAction,
  DocumentSpecification,
} from "@powerhousedao/shared/document-model";
import { releaseNewVersion } from "@powerhousedao/shared/document-model";
import { useRef, useState } from "react";
import type { StateShapeDiff } from "../utils/change-classification.js";
import { decideDispatch } from "../utils/change-classification.js";
import type { useSelectedDocumentModelDocument } from "./useDocumentModelDocument.js";

export type DocumentModelDispatch = NonNullable<
  ReturnType<typeof useSelectedDocumentModelDocument>[1]
>;

export type VersionAdvisoryPrompt = {
  version: number;
  reason: string;
  diff?: StateShapeDiff;
};

/**
 * Versions the user has confirmed as "still in development" (or that were
 * just created via an explicit release) for this browser session. Keyed by
 * `${documentId}:${version}`. Deliberately in-memory: a publisher returning
 * in a later session is asked again, which is when the reminder matters.
 */
const sessionVersionChoices = new Set<string>();

export function useVersionAdvisory(args: {
  documentId: string;
  latestSpec: DocumentSpecification;
  previousSpec?: DocumentSpecification;
  dispatch: DocumentModelDispatch;
  onReleaseError?: (message: string) => void;
}): {
  guardedDispatch: DocumentModelDispatch;
  prompt: VersionAdvisoryPrompt | undefined;
  releaseFirst: () => void;
  keepEditing: () => void;
  cancelAdvisory: () => void;
  markVersionInDevelopment: (version: number) => void;
} {
  const { documentId, latestSpec, previousSpec, dispatch, onReleaseError } =
    args;
  const [prompt, setPrompt] = useState<VersionAdvisoryPrompt | undefined>(
    undefined,
  );
  const pendingRef = useRef<Parameters<DocumentModelDispatch> | undefined>(
    undefined,
  );
  const choiceKey = `${documentId}:${latestSpec.version}`;

  const guardedDispatch: DocumentModelDispatch = (...dispatchArgs) => {
    const [action] = dispatchArgs;
    const actionList = Array.isArray(action) ? action : [action];
    const actions = actionList.filter(
      (candidate): candidate is DocumentModelAction => candidate !== undefined,
    );
    const decision = decideDispatch(
      actions,
      latestSpec,
      previousSpec,
      sessionVersionChoices.has(choiceKey),
    );
    if (decision.kind === "dispatch") {
      dispatch(...dispatchArgs);
      return;
    }
    pendingRef.current = dispatchArgs;
    setPrompt({
      version: latestSpec.version,
      reason: decision.reason,
      diff: decision.diff,
    });
  };

  const flushPending = () => {
    const pending = pendingRef.current;
    pendingRef.current = undefined;
    if (pending) {
      dispatch(...pending);
    }
  };

  const releaseFirst = () => {
    setPrompt(undefined);
    if (!pendingRef.current) return;
    dispatch(
      releaseNewVersion(),
      (errors) => {
        if (errors.length > 0) {
          pendingRef.current = undefined;
          onReleaseError?.(errors[0].message);
        }
      },
      () => {
        if (!pendingRef.current) return;
        sessionVersionChoices.add(`${documentId}:${latestSpec.version + 1}`);
        flushPending();
      },
    );
  };

  const keepEditing = () => {
    sessionVersionChoices.add(choiceKey);
    setPrompt(undefined);
    flushPending();
  };

  const cancelAdvisory = () => {
    pendingRef.current = undefined;
    setPrompt(undefined);
  };

  const markVersionInDevelopment = (version: number) => {
    sessionVersionChoices.add(`${documentId}:${version}`);
  };

  return {
    guardedDispatch,
    prompt,
    releaseFirst,
    keepEditing,
    cancelAdvisory,
    markVersionInDevelopment,
  };
}
