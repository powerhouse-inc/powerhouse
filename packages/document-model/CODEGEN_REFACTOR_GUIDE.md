# Codegen Refactoring Guide for PHDocument State Management

## Overview

This guide documents the changes required to refactor generated code in the `gen/` folder to support the new PHDocument state management system. The main change is that `PHDocument` now requires a state type parameter that extends `PHBaseState`, and all document-specific state must be properly composed with the base state.

## Core Concept Changes

### Before
- Documents had separate `global` and `local` state properties directly
- `PHDocument` was a simple type with two generic parameters: `PHDocument<GlobalState, LocalState>`
- State was managed independently from base document properties

### After  
- Documents have a single state type that extends `PHBaseState`
- `PHBaseState` contains `auth` and `document` properties for system state
- Document-specific state (`global` and `local`) are composed with `PHBaseState`
- `PHDocument` takes a single generic parameter: `PHDocument<TState extends PHBaseState>`

## Required Files and Changes

### 1. Create `ph-factories.ts` (NEW FILE)

This is a new file that must be generated to handle state composition and document creation. In the example below, the document-model has only global and local scopes, but the pattern is the same for any number of scopes.

```typescript
/**
 * Factory methods for creating [DocumentName]Document instances
 */

import {
  createBaseState,
  defaultBaseState,
  type PHAuthState,
  type PHBaseState,
  type PHDocumentState,
} from "document-model";
import type {
  [DocumentName]Document,
  [DocumentName]LocalState,
  [DocumentName]State,
} from "./types.js";
import { createDocument } from "./utils.js";

// Default state factory for global state
export function defaultGlobalState(): [DocumentName]State {
  return {
    ...defaultBaseState(),  // This line seems wrong but gets removed by spread
    // ... all properties from the document's global state schema
  };
}

// Default state factory for local state
export function defaultLocalState(): [DocumentName]LocalState {
  return {
    // ... all properties from the document's local state schema
  };
}

// Combined default state
export function defaultPHState(): [DocumentName]PHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

// Factory for creating global state with partials
export function createGlobalState(
  state?: Partial<[DocumentName]State>,
): [DocumentName]State {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as [DocumentName]State;
}

// Factory for creating local state with partials  
export function createLocalState(
  state?: Partial<[DocumentName]LocalState>,
): [DocumentName]LocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as [DocumentName]LocalState;
}

// Main state creation function that composes all parts
export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<[DocumentName]State>,
  localState?: Partial<[DocumentName]LocalState>,
): [DocumentName]PHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

// CRITICAL: Define the composed state type
export type [DocumentName]PHState = PHBaseState & {
  global: [DocumentName]State;
  local: [DocumentName]LocalState;
};

// Convenience function for creating documents with proper state
export function create[DocumentName]Document(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<[DocumentName]State>;
    local?: Partial<[DocumentName]LocalState>;
  }>,
): [DocumentName]Document {
  const document = createDocument(
    state
      ? createState(
          createBaseState(state.auth, state.document),
          state.global,
          state.local,
        )
      : undefined,
  );

  return document;
}
```

### 2. Update `types.ts`

The types file needs to be updated to use the new PHState type and properly type the document.

#### Before:
```typescript
import type { BaseDocument } from "../../document/types.js";
import type { [DocumentName]Action } from "./actions.js";
import type {
  [DocumentName]LocalState,
  [DocumentName]State,
} from "./schema/types.js";

export type [DocumentName]Document = BaseDocument<
  [DocumentName]State,
  [DocumentName]LocalState
>;
export { [DocumentName]Action, [DocumentName]LocalState, [DocumentName]State };
```

#### After:
```typescript
import type { PHDocument } from "../../document/types.js";
import type { [DocumentName]Action } from "./actions.js";
import { [DocumentName]PHState } from "./ph-factories.js";
import type {
  [DocumentName]LocalState,
  [DocumentName]State,
} from "./schema/types.js";

export type [DocumentName]Document = PHDocument<[DocumentName]PHState>;
export { [DocumentName]Action, [DocumentName]LocalState, [DocumentName]State };
```

### 3. Update `utils.ts`

The utils file needs to use the new PHState type for all type parameters.

#### Key Changes:

1. Import the PHState type:
```typescript
import { [DocumentName]PHState } from "./ph-factories.js";
```

2. Update `createState` function signature:
```typescript
export const createState: CreateState<[DocumentName]PHState> = (state) => {
  return {
    ...defaultBaseState(),
    global: { ...documentModelState, ...(state?.global ?? {}) },
    local: { ...initialLocalState, ...(state?.local ?? {}) },
  };
};
```

3. Update `createDocument` function signature:
```typescript
export const createDocument: CreateDocument<[DocumentName]PHState> = (state) => {
  const document = baseCreateDocument(createState, state);
  document.header.documentType = documentType;
  return document;
};
```

4. Update `loadFromFile` function signature:
```typescript
export const loadFromFile: LoadFromFile<[DocumentName]PHState> = (path) => {
  return baseLoadFromFile(path, reducer);
};
```

5. Update `loadFromInput` function signature:
```typescript
export const loadFromInput: LoadFromInput<[DocumentName]PHState> = (input) => {
  return baseLoadFromInput(input, reducer);
};
```

### 4. Update `reducer.ts`

The reducer needs to work with the new PHState type.

#### Key Changes:

1. Import the PHState type:
```typescript
import { [DocumentName]PHState } from "./ph-factories.js";
```

2. Update the state reducer signature:
```typescript
export const stateReducer: TStateReducer<[DocumentName]PHState> = (
  state,
  action,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  
  // ... rest of reducer logic
};
```

3. Update the main reducer export:
```typescript
export const reducer = createReducer<[DocumentName]PHState>(stateReducer);
```

### 5. Update `object.ts` (if present)

If the document has an object representation, update it to use the PHState type.

#### Key Changes:

1. Import PHState:
```typescript
import { [DocumentName]PHState } from "./ph-factories.js";
```

2. Update class definition:
```typescript
export class [DocumentName] extends BaseDocument<[DocumentName]PHState> {
  // ... class implementation
}
```

### 6. Update `document-model.ts` (main export file)

Ensure the main export file re-exports the new PHState type and factory functions:

```typescript
export type { [DocumentName]PHState } from "./ph-factories.js";
export {
  create[DocumentName]Document,
  createState,
  defaultPHState,
  defaultGlobalState,
  defaultLocalState,
} from "./ph-factories.js";
```

## Implementation Checklist

When refactoring generated code for a document type, follow this checklist:

1. ✅ Create `ph-factories.ts` with:
   - [ ] `defaultGlobalState()` function
   - [ ] `defaultLocalState()` function  
   - [ ] `defaultPHState()` function
   - [ ] `createGlobalState()` function
   - [ ] `createLocalState()` function
   - [ ] `createState()` function
   - [ ] `[DocumentName]PHState` type definition
   - [ ] `create[DocumentName]Document()` convenience function

2. ✅ Update `types.ts`:
   - [ ] Change from `BaseDocument` to `PHDocument`
   - [ ] Import `[DocumentName]PHState` from ph-factories
   - [ ] Update document type to use `PHDocument<[DocumentName]PHState>`

3. ✅ Update `utils.ts`:
   - [ ] Import `[DocumentName]PHState`
   - [ ] Update all generic type parameters to use `[DocumentName]PHState`
   - [ ] Ensure `createState` properly composes base state with document state

4. ✅ Update `reducer.ts`:
   - [ ] Import `[DocumentName]PHState`
   - [ ] Update `stateReducer` type signature
   - [ ] Update main `reducer` export

5. ✅ Update `object.ts` (if exists):
   - [ ] Import `[DocumentName]PHState`
   - [ ] Update class generic parameter

6. ✅ Update main export file:
   - [ ] Export PHState type
   - [ ] Export factory functions

## Important Notes

### State Composition
The key insight is that document state is now composed of three parts:
1. **Base state** (`auth` and `document` properties from `PHBaseState`)
2. **Global state** (document-specific global state)
3. **Local state** (document-specific local state)

### Type Safety
Always ensure that:
- The PHState type properly extends `PHBaseState`
- All functions that create or manipulate state use the correct PHState type
- The spread operator properly merges base state with document state

### Backwards Compatibility
When consuming code uses the old pattern, you may need to:
1. Access `document.state.global` instead of `document.global`
2. Access `document.state.local` instead of `document.local`
3. Use the new factory functions instead of direct object creation

## Example Migration

For a document called "BillingStatement", the changes would be:

1. Create `billing-statement/gen/ph-factories.ts`
2. Change type from `BaseDocument<BillingStatementState, BillingStatementLocalState>` to `PHDocument<BillingStatementPHState>`
3. Define `BillingStatementPHState = PHBaseState & { global: BillingStatementState; local: BillingStatementLocalState }`
4. Update all generic parameters from separate state types to the single PHState type

## Testing Considerations

After refactoring, ensure that:
1. All documents can be created with the new factory functions
2. State is properly initialized with base state properties
3. Reducers can access both base state and document state
4. Serialization/deserialization works correctly
5. Type checking passes without errors