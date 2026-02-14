import { ts } from "@tmpl/core";

const defaultNamespaceComment =
  '// Default namespace: `${this.name}_${driveId.replaceAll("-", "_")}`';
export const relationalDbIndexTemplate = (v: { pascalCaseName: string }) =>
  ts`
import { RelationalDbProcessor } from "@powerhousedao/reactor";
import type { OperationWithContext } from "shared/document-model";
import { up } from "./migrations.js";
import type { DB } from "./schema.js";

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
}
`.raw;
