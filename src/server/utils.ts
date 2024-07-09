import type { Document, OperationScope } from 'document-model/document';
import { RevisionsFilter, StrandUpdate } from './types';

export function buildRevisionsFilter(
    strands: StrandUpdate[],
    driveId: string,
    documentId: string
): RevisionsFilter {
    return strands.reduce<RevisionsFilter>((acc, s) => {
        if (!(s.driveId === driveId && s.documentId === documentId)) {
            return acc;
        }
        acc[s.scope] = s.operations[s.operations.length - 1]?.index ?? -1;
        return acc;
    }, {});
}

export function filterOperationsByRevision(
    operations: Document['operations'],
    revisions?: RevisionsFilter
): Document['operations'] {
    if (!revisions) {
        return operations;
    }
    return (Object.keys(operations) as OperationScope[]).reduce<
        Document['operations']
    >((acc, scope) => {
        const revision = revisions[scope];
        if (revision !== undefined) {
            acc[scope] = operations[scope].filter(op => op.index <= revision);
        }
        return acc;
    }, operations);
}
