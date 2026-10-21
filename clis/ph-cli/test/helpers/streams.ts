import type { CheckStreams } from "../../src/services/model-check.js";

export function recordStreams(): {
  readonly streams: CheckStreams;
  stdout: string;
  stderr: string;
} {
  const recorded = {
    stdout: "",
    stderr: "",
    streams: {
      out: (text: string) => {
        recorded.stdout += text;
      },
      err: (text: string) => {
        recorded.stderr += text;
      },
    },
  };
  return recorded;
}
