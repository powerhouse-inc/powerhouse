import type { PHDocument } from "document-model";
import { filter, isTruthy, map, mapToObj, pipe, prop, unique } from "remeda";
import { type Batch, batch } from "./batch.js";
import { reactorGraphqlBatchFetchDocuments } from "./fetchers.js";

function makeDocumentsById(documents: (PHDocument | undefined)[] = []) {
  return pipe(
    documents,
    filter(isTruthy),
    mapToObj((document) => [document.header.id, document]),
  );
}

export class DocumentFetcher {
  private batchGetDocuments: Batch<[id: string], PHDocument>;

  constructor() {
    this.batchGetDocuments = batch(
      async (requests: readonly [id: string][]) => {
        const ids = unique(map(requests, ([id]) => id));
        const documents = await reactorGraphqlBatchFetchDocuments(ids);

        return makeDocumentsById(documents);
      },
      (documentsById, _, id) => {
        const document = prop(documentsById, id);
        return document;
      },
    );
  }

  get(id: string): Promise<PHDocument> {
    return this.batchGetDocuments.call(id);
  }

  getBatch(ids: string[]): Promise<PHDocument[]> {
    return Promise.all(map(ids, (id) => this.get(id)));
  }
}
