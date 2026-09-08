import { defineSubgraph } from "@powerhousedao/reactor-api";
import { ph } from "document-model";

export const CodeFirstStatusSubgraph = defineSubgraph({
  name: "code-first-status",
  schemaKind: "typed",
  entries: (builder) => [
    builder.query("codeFirstStatus", {
      returns: ph.ref(
        ph.object("StatusResponse", {
          fields: {
            status: ph.String({ required: true }),
            timestamp: ph.DateTime({ required: true }),
          },
        }),
        { required: true },
      ),
      resolve() {
        return {
          status: "code-first-ok",
          timestamp: new Date().toISOString(),
        };
      },
    }),
  ],
});
