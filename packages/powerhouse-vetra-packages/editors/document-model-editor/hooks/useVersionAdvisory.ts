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
  // Every dispatch held back while the prompt is open is queued, so a second
  // edit arriving mid-prompt (e.g. a blur-committed field as the modal steals
  // focus) is not silently discarded.
  const pendingRef = useRef<Parameters<DocumentModelDispatch>[]>([]);
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
    pendingRef.current.push(dispatchArgs);
    setPrompt({
      version: latestSpec.version,
      reason: decision.reason,
      diff: decision.diff,
    });
  };

  const flushPending = () => {
    const pending = pendingRef.current;
    pendingRef.current = [];
    for (const dispatchArgs of pending) {
      dispatch(...dispatchArgs);
    }
  };

  const releaseFirst = () => {
    setPrompt(undefined);
    if (pendingRef.current.length === 0) return;
    dispatch(
      releaseNewVersion(),
      (errors) => {
        if (errors.length > 0) {
          pendingRef.current = [];
          onReleaseError?.(errors[0].message);
        }
      },
      () => {
        if (pendingRef.current.length === 0) return;
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
    pendingRef.current = [];
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
