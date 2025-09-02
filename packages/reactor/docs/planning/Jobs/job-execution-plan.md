# Job Execution Plan - Phase 4 Implementation

## Overview
This document outlines the plan for implementing proper job execution in the Reactor's `IJobExecutor`, specifically focusing on integrating document model reducers to process actions and generate operations.

## Current State Analysis

### Legacy Implementation (document-drive/base-server.ts)
The current system processes actions through the following flow:

1. **Action Queuing**: Actions are queued via `_queueActions()` which creates an `ActionJob`
2. **Job Processing**: The `queueDelegate.processActionJob()` handles the job
3. **Operation Building**: `_buildOperations()` method:
   - Retrieves the document model's reducer for the document type
   - Iterates through actions, applying each to the reducer
   - Extracts the generated operation from the updated document
   - Returns the list of operations
4. **Storage**: Operations are written to storage

### Key Components from Legacy
```typescript
// Simplified version of _buildOperations
private _buildOperations(document: PHDocument, actions: Action[]): Operation[] {
  const operations: Operation[] = [];
  const { reducer } = this.getDocumentModelModule(document.header.documentType);
  
  for (const action of actions) {
    document = reducer(document, action);
    const operation = document.operations[action.scope].slice().pop();
    if (!operation) {
      throw new Error("Error creating operations");
    }
    operations.push(operation);
  }
  return operations;
}
```

## Phase 4 Implementation Requirements

### 1. JobExecutor Enhancement
The `IJobExecutor` implementation needs to:
- Load the appropriate document model module based on document type
- Apply actions through the reducer to generate operations
- Write operations to storage (initially legacy storage, later dual-write)

### 2. Dependencies Required
The JobExecutor will need access to:
- **Document Model Registry**: To retrieve reducers for document types
- **Document Storage**: To read current document state
- **Operation Storage**: To write generated operations (Phase 4: legacy storage)
- **Event Bus**: To emit job completion events

### 3. Job Processing Flow

```
Job (containing Action) 
  ↓
JobExecutor.executeJob()
  ↓
1. Load document from storage
2. Get document model module/reducer
3. Apply action via reducer
4. Extract generated operation
5. Write operation to storage
6. Emit completion event
```

## Implementation Steps

### Step 1: Create DocumentModelRegistry
See [Document Model Registry](Jobs/document-model-registry.md) for detailed design and implementation of the registry component.

### Step 2: Implement Job Processing Logic
```typescript
class JobExecutor implements IJobExecutor {
  private async performJobExecution(job: Job): Promise<JobResult> {
    // 1. Load document
    const document = await this.documentStorage.get(job.documentId);
    
    // 2. Get reducer
    const module = this.registry.getModule(document.header.documentType);
    const { reducer } = module;
    
    // 3. Apply action
    const updatedDocument = reducer(document, job.operation.action);
    
    // 4. Extract operation
    const operations = updatedDocument.operations[job.scope];
    const newOperation = operations[operations.length - 1];
    
    // 5. Store operation (Phase 4: legacy storage)
    await this.operationStorage.addOperation(job.documentId, newOperation);
    
    // 6. Update document in storage
    await this.documentStorage.set(job.documentId, updatedDocument);
    
    return { success: true, operation: newOperation };
  }
}
```

### Step 3: Testing Strategy

#### Unit Tests for JobExecutor
1. **Test reducer integration**:
   - Mock document storage
   - Mock operation storage
   - Use real document model reducer
   - Verify operation generation

2. **Test operation storage**:
   - Verify operations are correctly stored
   - Test error handling

3. **Test document state updates**:
   - Verify document state changes after action
   - Test multiple actions in sequence

#### Integration Tests
1. **End-to-end mutation flow**:
   - Call `reactor.mutate()`
   - Poll job status
   - Verify document updated
   - Verify operations stored

## Migration Path

### Phase 4: Legacy Storage Integration
- JobExecutor writes to legacy `IDriveOperationStorage`
- Validates the pipeline works with existing storage

### Phase 5: Dual-Write Implementation
- JobExecutor writes to both legacy and new `IOperationStore`
- Enables validation between old and new systems

### Phase 6+: New Storage Primary
- Switch to new `IOperationStore` as primary
- Legacy storage becomes read-only via adapters

## Test Implementation Priority

1. **Immediate**: Create `job-executor-reducer.test.ts`
   - Test reducer integration in isolation
   - Mock storages, use real reducers
   - Verify operation generation

2. **Next**: Create `reactor-mutate.test.ts`
   - Integration test with real job execution
   - Verify end-to-end mutation flow

3. **Future**: Performance and concurrency tests
   - Test multiple concurrent mutations
   - Test retry logic with failures

## Success Criteria

- [ ] JobExecutor successfully applies actions via reducers
- [ ] Operations are correctly generated and stored
- [ ] Document state is updated after mutations
- [ ] Tests validate the complete mutation pipeline
- [ ] No regression in existing functionality
