---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/listener.ts"
force: true
---
import { InternalTransmitterUpdate, Listener } from "document-drive";
import get from "./service";
import { AnalyticsPath } from "@powerhousedao/analytics-engine-core";
import { DateTime } from "luxon";

export const options: Omit<Listener, "driveId"> = {
  listenerId: "<%= h.changeCase.param(name) %>",
  filter: {
    branch: ["main"],
    documentId: ["*"],
    documentType: [
      <% documentTypes.forEach(type => { _%>
      "<%= type %>",
      <% }); _%>
    ],
    scope: ["global"],
  },
  block: false,
  label: "<%= h.changeCase.param(name) %>",
  system: true,
};

export async function transmit(strands: InternalTransmitterUpdate[]) {
  for (const strand of strands) {
    handle(strand).catch((err) => {
      console.error("Error handling strand", err);
    });
  }

  return Promise.resolve();
}

async function handle(strand: InternalTransmitterUpdate) {
  const analytics = get();

  await Promise.all(
    strand.operations.map((operation) => {
      const source = AnalyticsPath.fromString(
        `switchboard/default/${strand.driveId}`,
      );

      const start = DateTime.fromISO(operation.timestamp);
      const dimensions: any = {
        type: AnalyticsPath.fromString(`operation/type/${operation.type}`),
        drive: AnalyticsPath.fromString(`drive/${strand.driveId}`),
      };

      if (strand.documentId) {
        dimensions["document"] = AnalyticsPath.fromString(
          `document/${strand.documentId}/${strand.scope}`,
        );
      }

      // todo: +1, -1 for doc created and destroyed

      // todo: count documents of each type (ADD_FILE, input.documentType)

      return analytics.addSeriesValues([
        {
          source,
          start,
          value: 1,
          metric: "Count",
          dimensions,
        },
      ]);
    }),
  );
}
