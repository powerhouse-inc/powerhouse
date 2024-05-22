import { utils } from 'document-model/document';

export const { attachBranch,
    garbageCollect,
    groupOperationsByScope,
    merge,
    split,
    precedes,
    removeExistingOperations,
    reshuffleByTimestamp,
    sortOperations,
    addUndo,
    checkOperationsIntegrity,
    checkCleanedOperationsIntegrity,
    reshuffleByTimestampAndIndex,
    nextSkipNumber,
    prepareOperations,
    IntegrityIssueSubType,
    IntegrityIssueType
} = utils.documentHelpers;
