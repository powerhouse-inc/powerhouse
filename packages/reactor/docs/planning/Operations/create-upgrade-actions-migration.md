# Migration Plan: Introduce CREATE_DOCUMENT and UPGRADE_DOCUMENT actions

This plan describes how to move from the current direct-create flow to the dual-action approach defined in `upgrades.md`:

- CREATE_DOCUMENT creates the base record + header (no model-specific state) and verifies signatures using minimal parameters.
- UPGRADE_DOCUMENT initializes or migrates model-specific state; the first upgrade initializes from the model’s default state.

The external API remains unchanged; the server internally constructs and executes the two actions, and records the resulting operations.

## Current state (baseline)

- The server immediately creates the document in storage inside `createDocument`, validating or generating a header inline, and persisting the full document (including state) in one step.
- No explicit `CREATE_DOCUMENT` or `UPGRADE_DOCUMENT` actions exist; the `operations` arrays are empty on creation.

## Target state (per spec)

- CREATE_DOCUMENT persists the base document + header; sets model version to `0.0.0`; validates signed headers using only minimal parameters.
- UPGRADE_DOCUMENT materializes model state to the target version. Since we do not yet have support for versioning inside of document models, at this time we only need to support the initial UPGRADE_DOCUMENT. This means that for the first upgrade (from `0.0.0`), we initialize from the model’s `defaultState()` or the `initialState` field (if present).
- Record both operations on the document.

## Constraints

- Keep the public createDocument interface intact (inputs/return types unchanged).
- Backward-compatible with unsigned and signed creation flows already supported by the server.

## Type definitions

Define in `document-model/src/core/types.ts`:

```ts
export type CreateDocumentAction = {
  type: 'CREATE_DOCUMENT';
  model: string;       // e.g., 'ph/todo'
  version: '0.0.0';
  documentId: string;  // equals signature when signed; UUID when unsigned
  signing?: {
    signature: string;
    publicKey: JsonWebKey;
    nonce: string;
    createdAtUtcIso: string;
    documentType: string;
  };
};

export type UpgradeDocumentAction = {
  type: 'UPGRADE_DOCUMENT';
  model: string;
  fromVersion: string; // '0.0.0' for first upgrade
  toVersion: string;   // current model version
  documentId: string;
  initialState?: object; // optional; defaults to model.defaultState()
};
```

## Feature flag implementation

1) Add to `feature-flags.ts`:
```ts
export const FEATURE_FLAGS = {
  // ... existing flags
  DUAL_ACTION_CREATE: process.env.ENABLE_DUAL_ACTION_CREATE === 'true' || false,
} as const;
```

2) Update base-server constructor to accept configuration:
```ts
interface BaseServerConfig {
  // ... existing config
  featureFlags?: {
    enableDualActionCreate?: boolean;
  };
}

constructor(config: BaseServerConfig) {
  this.enableDualActionCreate = config.featureFlags?.enableDualActionCreate ?? FEATURE_FLAGS.DUAL_ACTION_CREATE;
  // ... rest of constructor
}
```

3) Update reactor builder:
```ts
// In the builder that creates base-server instances
const server = new BaseServer({
  // ... existing config
  featureFlags: {
    enableDualActionCreate: false, // default to false for safety
  },
});
```

4) Use flag in createDocument:
```ts
protected async createDocument(input) {
  // ... existing header logic ...
  
  if (this.enableDualActionCreate) {
    // New dual-action flow
    const operations = [
      { type: 'CREATE_DOCUMENT', documentId },
      { type: 'UPGRADE_DOCUMENT', documentId, fromVersion: '0.0.0', toVersion }
    ];
    // ... create document with operations ...
  } else {
    // Existing direct create flow
    // ... current implementation ...
  }
}
```

## Implementation steps

1) Create actions
- Build CREATE_DOCUMENT action with documentId, model, and signing parameters (if signed)
- Build UPGRADE_DOCUMENT action with initialState from input or model's defaultState()

2) Create operations from actions  
- CREATE_DOCUMENT operation: `{ type: 'CREATE_DOCUMENT', documentId }`
- UPGRADE_DOCUMENT operation: `{ type: 'UPGRADE_DOCUMENT', documentId, fromVersion: '0.0.0', toVersion: currentVersion }`

3) Create document with correct state and operations
- Header: from existing logic (signed or unsigned)
- State: use initialState from UPGRADE_DOCUMENT action
- Operations: include the two operations created above

4) Store document
- Use existing `documentStorage.create(documentStorage)`

5) Store operations  
- Use existing `addDocumentOperations` with the two operations

## Pseudocode

```ts
function createDocument(input) {
  // 1. Create actions
  const createAction = { type: 'CREATE_DOCUMENT', documentId, model, signing };
  const upgradeAction = { 
    type: 'UPGRADE_DOCUMENT', 
    documentId, 
    fromVersion: '0.0.0',
    toVersion: currentVersion,
    initialState: input.state ?? model.defaultState()
  };
  
  // 2. Create operations from actions
  const operations = [
    { type: 'CREATE_DOCUMENT', documentId },
    { type: 'UPGRADE_DOCUMENT', documentId, fromVersion: '0.0.0', toVersion: currentVersion }
  ];
  
  // 3. Create document with correct state and operations
  const document = {
    header,  // from existing logic
    state: upgradeAction.initialState,
    operations: { global: operations, local: [] },
    initialState,
    clipboard: []
  };
  
  // 4. Store document
  await documentStorage.create(document);
  
  // 5. Store operations
  await addDocumentOperations(documentId, operations, document);
  
  return getDocument(documentId);
}
```

## Acceptance criteria

- Public create API unchanged
- Two operations (CREATE_DOCUMENT and UPGRADE_DOCUMENT) are recorded on document creation
- Document state is initialized from input or defaultState()
- Existing signed/unsigned flows continue to work
