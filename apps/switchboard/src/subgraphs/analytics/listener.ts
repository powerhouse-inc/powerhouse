import { InternalTransmitterUpdate, Listener } from "document-drive";
import get from "./service";
import { AnalyticsPath, AnalyticsSeriesInput } from "@powerhousedao/analytics-engine-core";
import { DateTime } from "luxon";

export const options: Omit<Listener, "driveId"> = {
  listenerId: "general-analytics-analyzer",
  filter: {
    branch: ["main"],
    documentId: ["*"],
    documentType: ["powerhouse/document-drive"],
    scope: ["global"],
  },
  block: false,
  label: "general-analytics-analyzer",
  system: true,
};

export async function transmit(strands: InternalTransmitterUpdate[]) {
  for (const strand of strands) {
    handle(strand).catch((err) => {
      console.error('Error handling strand', err);
    });
  }

  return Promise.resolve();
}

const findNode = (state: any, id: string) => {
  const { nodes } = state;
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
  }

  return null;
};

type AddFileInput = {
  id: string;
  name: string;
  documentType: string;
  parentFolder: string;
}

type AddFolderInput = {
  id: string;
  name: string;
  parentFolder: string;
}

async function handle(strand: InternalTransmitterUpdate) {
  const analytics = get();

  console.log(">>>>", "Current State", JSON.stringify(strand.state, null, 2));

  const values:AnalyticsSeriesInput[] = [];

  await Promise.all(strand.operations.map((operation) => {
    const source = AnalyticsPath.fromString(`switchboard/default/${strand.driveId}`);

    const start = DateTime.fromISO(operation.timestamp);
    const dimensions: any = {
      documentType: AnalyticsPath.fromString(`document/type/powerhouse/document-drive`),
    };

    switch (operation.type) {
      case "ADD_FILE": {
        // count documents of each type (ADD_FILE, input.documentType)

        // lookup node in state
        const input = operation.input as AddFileInput;
        const node = findNode(strand.state, input.id);
        if (!node) {
          return Promise.resolve();
        }

        dimensions["kind"] = AnalyticsPath.fromString(`document/kind/${node.kind}`);

        values.push({
          source,
          start,
          value: 1,
          metric: "Count",
          dimensions,
        });
        
        break;
      }
      case "ADD_FOLDER": {
        dimensions["kind"] = AnalyticsPath.fromString("document/kind/folder");

        values.push({
          source,
          start,
          value: 1,
          metric: "Count",
          dimensions,
        });
        
        break;
      }
      case "DELETE_NODE": {
        // lookup item type in state


        break;
      }
    }

    // todo: +1, -1 for doc created and destroyed
  }));

  await analytics.addSeriesValues(values);
}