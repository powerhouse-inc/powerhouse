import { type PHDocument } from "document-model";
import { type ExpectStatic } from "vitest";

export function expectUTCTimestamp(expect: ExpectStatic): unknown {
  return expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/i);
}

export function expectUUID(expect: ExpectStatic): unknown {
  return expect.stringMatching(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
}

export function getDocumentScopeIndexes(document: PHDocument) {
  return Object.entries(document.operations).reduce(
    (acc, [scope, ops]) => ({
      ...acc,
      [scope]: ops.at(-1)?.index ?? -1,
    }),
    {} as Record<string, number>,
  );
}
