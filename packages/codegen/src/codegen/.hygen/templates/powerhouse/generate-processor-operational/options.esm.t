---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/options.ts"
force: true
---
import { Listener } from "document-drive";

/**
 * The options for the processor.
 */
export const options: Omit<Listener, "driveId"> = {
  listenerId: "test",
  filter: {
    branch: ["main"],
    documentId: ["*"],
    documentType: ["frank/test"],
    scope: ["global"],
  },
  block: false,
  label: "test",
  system: true,
};
