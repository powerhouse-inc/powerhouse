import { IBaseDocumentDriveServer, InternalTransmitter, InternalTransmitterUpdate, Listener, ListenerRevision } from "document-drive";
import { AnalyticsPath, AnalyticsSeriesInput, IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { DateTime } from "luxon";
import { AnalyticsResolvers, typedefs } from "@powerhousedao/analytics-engine-graphql";

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

export class AnalyticsProcessor extends InternalTransmitter {
  public readonly name = "analytics/:drive";

  public readonly resolvers: any = AnalyticsResolvers;
  public readonly typeDefs: string = typedefs;
  public readonly options: Omit<Listener, "driveId">;

  public dbSchema?: Record<string, unknown>;

  private readonly _analytics: IAnalyticsStore;

  constructor(
    analytics: IAnalyticsStore,
    drive: IBaseDocumentDriveServer,
    driveId: string,) {
  
    const listener = {
      driveId,
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

    super(listener, drive);

    this._analytics = analytics;
    this.options = listener;
  }

  async transmit(strands: InternalTransmitterUpdate[]): Promise<ListenerRevision[]> {
    const results = await Promise.allSettled(strands.map(this.handle));
    
    return results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        return {
          ...strands[index],
          status: "ERROR",
          error: result.reason,
        } as ListenerRevision;
      }
    });
  }

  private async handle(strand: InternalTransmitterUpdate): Promise<ListenerRevision> {
    console.log(">>>>", "Current State", JSON.stringify(strand.state, null, 2));
  
    const values:AnalyticsSeriesInput[] = [];
  
    const operations = strand.operations;
    await Promise.all(operations.map((operation) => {
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
  
    await this._analytics.addSeriesValues(values);

    return {
      ...strand,
      status: "SUCCESS",
      revision: operations[operations.length - 1]?.index ?? -1,
    };
  }
}

