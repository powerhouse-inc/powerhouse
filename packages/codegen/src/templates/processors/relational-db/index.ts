import { ts } from "@tmpl/core";

const defaultNamespaceComment =
  '// Default namespace: `${this.name}_${driveId.replaceAll("-", "_")}`';
const taskString =
  "`${strand.documentId}-${operation.index}: ${operation.action.type}`";
export const relationalDbIndexTemplate = (v: { pascalCaseName: string }) =>
  ts`
import { RelationalDbProcessor } from "document-drive";
import type { InternalTransmitterUpdate } from "document-drive";
import { up } from "./migrations.js";
import type { DB } from "./schema.js";
import type { OperationWithContext } from "@powerhousedao/reactor";

export class ${v.pascalCaseName}Processor extends RelationalDbProcessor<DB> {
    onOperations(operations: OperationWithContext[]): Promise<void> {
    return Promise.resolve();
  }

  onDisconnect(): Promise<void> {
    return Promise.resolve();
  }

  static override getNamespace(driveId: string): string {
    ${defaultNamespaceComment}
    return super.getNamespace(driveId);
  }

  override async initAndUpgrade(): Promise<void> {
    await up(this.relationalDb);
  }

  override async onStrands(
    strands: InternalTransmitterUpdate[],
  ): Promise<void> {
    if (strands.length === 0) {
      return;
    }

    for (const strand of strands) {
      if (strand.operations.length === 0) {
        continue;
      }

      for (const operation of strand.operations) {
        await this.relationalDb
          .insertInto("todo")
          .values({
            task: ${taskString},
            status: true,
          })
          .onConflict((oc) => oc.column("task").doNothing())
          .execute();
      }
    }
  }
}
`.raw;
