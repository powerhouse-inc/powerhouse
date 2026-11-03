// Which switchboard a workflow tool asks: the one named, the one serving the
// document the call is about, else the only one that runs workflows. The host
// hands its switchboard directory to every call (AiToolContext); there is no
// default URL to fall back on.
import { resolveSwitchboard } from "@powerhousedao/reactor-browser";
import type { AiToolContext } from "@powerhousedao/reactor-browser/ai";
import type { PhAiToolContext } from "@powerhousedao/shared/document-model";
import { z } from "zod";
import {
  runtimeAt,
  type AiRuntime,
} from "../editors/workflow-editor/runtime-api.js";

/** The `switchboard` input every workflow tool takes. */
export const switchboardInput = z
  .string()
  .optional()
  .describe(
    "The switchboard to ask: a name or URL from listSwitchboards. Omit when only one switchboard runs workflows.",
  );

export interface RuntimeRequest {
  switchboard?: string;
  /** The workflow, connection or drive the call is about. */
  documentId?: string;
}

/** The workflow runtime a tool call goes to; throws when none can be picked. */
export async function runtimeFor(
  context: PhAiToolContext | undefined,
  request: RuntimeRequest = {},
): Promise<AiRuntime> {
  const { switchboards, signal } = (context ?? {}) as AiToolContext;
  const switchboard = await resolveSwitchboard(switchboards, {
    switchboard: request.switchboard,
    documentId: request.documentId,
    need: "workflows",
    signal,
  });
  return runtimeAt(switchboard, { signal });
}
