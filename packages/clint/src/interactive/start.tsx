import React from "react";
import { render } from "ink";
import { Repl } from "./repl.js";
import type { ReplSession } from "./types.js";
import type { ServiceManager } from "../core/types.js";

export interface StartInkReplOptions {
  services?: ServiceManager;
  workdir?: string;
  /** Called after Ink mounts, before user input is accepted. The `append` function adds a system message to the Repl's display. */
  onStart?: (append: (msg: string) => void) => Promise<void>;
}

/**
 * Start the Ink-based interactive REPL.
 * This function renders the Repl component and waits until the user exits.
 */
export async function startInkRepl(
  session: ReplSession,
  opts?: StartInkReplOptions,
): Promise<void> {
  // Suppress exit-hook's "SYNCHRONOUS TERMINATION NOTICE" on process.exit()
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("SYNCHRONOUS TERMINATION NOTICE")
    )
      return;
    origError.apply(console, args);
  };

  const app = render(
    <Repl
      session={session}
      services={opts?.services}
      workdir={opts?.workdir}
      onStart={opts?.onStart}
    />,
    { exitOnCtrlC: false, kittyKeyboard: { mode: "auto" } },
  );
  await app.waitUntilExit();
}
