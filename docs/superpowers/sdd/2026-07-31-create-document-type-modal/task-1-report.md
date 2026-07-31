# Task 1 Report: CreateDocumentWithTypeModal Component

## What Was Implemented

Created a new modal component `CreateDocumentWithTypeModal` in `packages/design-system` that combines a document name input with a labeled select for choosing a document type. The component:

- Renders a modal with title "Create a new document"
- Includes a FormInput for document name with BrickGlobe icon
- Includes a labeled ConnectSelect for document type selection with placeholder "Select document type…" (Unicode ellipsis)
- Validates document name using `isValidName` from `@powerhousedao/shared/document-drive`
- Shows inline error message "Document name must not be empty or contain control characters." when name is invalid
- Only enables the "Create" button when both name is valid and a document type is selected
- Removes the placeholder from select options once a type is selected
- Fires `onCreate` callback with `{ name, documentType, version }` payload on create
- Calls optional `onTypeSelected` callback when a type is selected
- Resets all form state after close animation (300ms delay)

Component exports:
- `DocumentTypeOption` type (with readonly documentType, name, optional version and description)
- `CreateDocumentWithTypeModalProps` type (extends Modal props with documentTypes, onCreate, optional onTypeSelected)
- `CreateDocumentWithTypeModal` function component

## TDD Evidence

### RED: Test Fails (Step 2)
Command:
```bash
pnpm --filter @powerhousedao/design-system exec vitest run src/connect/components/modal/create-document-with-type-modal.test.tsx
```

Expected failure (file doesn't exist):
```
Error: Failed to resolve import "./create-document-with-type-modal.js" from "src/connect/components/modal/create-document-with-type-modal.test.tsx". Does the file exist?
```

### GREEN: Test Passes (Step 4)
Command:
```bash
pnpm --filter @powerhousedao/design-system exec vitest run src/connect/components/modal/create-document-with-type-modal.test.tsx
```

Output:
```
Test Files  1 passed (1)
     Tests  8 passed (8)
  Start at  14:07:38
  Duration  1.90s (transform 703ms, setup 62ms, import 1.34s, tests 193ms, environment 205ms)
```

All 8 tests passing:
1. renders placeholder and a disabled Create button ✓
2. does not enable Create with a name but no type ✓
3. does not enable Create with a type but no name ✓
4. enables Create with name + type and fires onCreate with the payload ✓
5. drops the placeholder from the options once a type is selected ✓
6. shows the error line for a whitespace-only name ✓
7. versionless options display the bare name and report version undefined ✓
8. cancel closes without firing onCreate ✓

## Typecheck (Step 5)
Command:
```bash
npx tsc --build packages/design-system
```

Result: Exit 0, no output — all types valid.

## Files Changed

1. **Created**: `/packages/design-system/src/connect/components/modal/create-document-with-type-modal.tsx`
   - New component implementation (294 lines including imports and implementation)

2. **Created**: `/packages/design-system/src/connect/components/modal/create-document-with-type-modal.test.tsx`
   - Test suite with 8 test cases covering behavior, validation, state management

3. **Modified**: `/packages/design-system/src/connect/components/modal/index.ts`
   - Added one export line in alphabetical order: `export * from "./create-document-with-type-modal.js";`

## Self-Review Findings

All requirements from the brief verified:

- ✓ Exact title: "Create a new document"
- ✓ Exact select placeholder: "Select document type…" (Unicode ellipsis `…`, not three dots)
- ✓ Exact select label: "Document type"
- ✓ Exact name input placeholder: "Document name"
- ✓ Exact error message: "Document name must not be empty or contain control characters."
- ✓ Button text: "Cancel" and "Create"
- ✓ Select option key format: `${documentType}::${version ?? 1}`
- ✓ Component types and props match spec (DocumentTypeOption, CreateDocumentWithTypeModalProps)
- ✓ Exports match import path in test file
- ✓ Barrel export added in alphabetical order (after create-document-modal.js)
- ✓ No modifications to ConnectSelect, CreateDocumentModal, or other files
- ✓ All tests pass with clean output

## Commit

```
commit 24de9e1a8
feat(design-system): add CreateDocumentWithTypeModal with document-type select
```

Files committed:
- packages/design-system/src/connect/components/modal/create-document-with-type-modal.tsx
- packages/design-system/src/connect/components/modal/create-document-with-type-modal.test.tsx
- packages/design-system/src/connect/components/modal/index.ts

## No Issues or Concerns

Component complete, tested, typechecked, and committed per brief. Ready for Task 2 (consumer integration).
