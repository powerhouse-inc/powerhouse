---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import type { PHDocument } from "document-model";
import { AnalyticsPath, IAnalyticsStore, IProcessor } from "@powerhousedao/reactor-api";
import { InternalTransmitterUpdate } from "document-drive";

<% documentTypes.forEach(type => { _%>
import type { <%= documentTypesMap[type].name %>Document } from "<%= documentTypesMap[type].importPath %>/index.js";
%><% }); _%>

export class <%= pascalName %>Processor implements IProcessor {

  constructor(private readonly analyticsStore: IAnalyticsStore) {
    //
  }

  async onStrands<TDocument extends PHDocument>(strands: InternalTransmitterUpdate<TDocument>[]): Promise<void> {
    if (strands.length === 0) {
      return;
    }

    for (const strand of strands) {
      if (strand.operations.length === 0) {
        continue;
      }

      const firstOp = strand.operations[0];
      const source = AnalyticsPath.fromString(
        `ph/${strand.driveId}/${strand.documentId}/${strand.branch}/${strand.scope}`,
      );
      if (firstOp.index === 0) {
        await this.clearSource(source);
      }

      for (const operation of strand.operations) {
        console.log(">>> ", operation.type);
      }
    }
  }

  async onDisconnect() {}

  private async clearSource(source: AnalyticsPath) {
    try {
      await this.analyticsStore.clearSeriesBySource(source, true);
    } catch (e) {
      console.error(e);
    }
  }
}