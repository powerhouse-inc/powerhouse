import { InternalTransmitterUpdate } from "document-drive";
import get from "./service";
import { AnalyticsPath } from "@powerhousedao/analytics-engine-core";
import { DateTime } from "luxon";

export async function transmit(strands: InternalTransmitterUpdate[]) {
  for (const strand of strands) {
    handle(strand).catch((err) => {
      console.error('Error handling strand', err);
    });
  }

  return Promise.resolve();
}

const source = AnalyticsPath.fromString('switchboard/default');

async function handle(strand: InternalTransmitterUpdate) {
  const analytics = get();

  await Promise.all(strand.operations.map((operation) => {
    console.log('Operation', operation);

    const start = DateTime.fromISO(operation.timestamp);

    return analytics.addSeriesValues([
      {
        source,
        start,
        value: 1,
        metric: "Count",
        dimensions: {
          type: AnalyticsPath.fromString(`operation/type/${operation.type}`),
          drive: AnalyticsPath.fromString(`drive/${strand.driveId}`),
          document: AnalyticsPath.fromString(`document/${strand.documentId}/${strand.scope}`),
        },
      },
    ]);
  }));
}