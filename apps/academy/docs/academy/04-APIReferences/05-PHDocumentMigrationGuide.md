# PHDocument Migration Guide

:::tip
This guide covers the **breaking changes** introduced in Powerhouse v4.0.0 related to PHDocument structure changes. If you're upgrading from v3.2.0 or earlier, **this migration is required** and document models must be regenerated.
:::

## Overview

Version 4.0.0 introduced a significant refactor of the `PHDocument` structure that consolidates document metadata into a `header` field. This change enables signed and unsigned documents with cryptographic verification capabilities, but requires updating all code that accesses document properties.

## What Changed

### Document Structure Refactor

The most significant change is the consolidation of document metadata into a `header` field. Previously, document properties were scattered at the root level of the document object.

**Before (v3.2.0 and earlier):**
```javascript
const document = {
  id: "doc-123",
  created: "2023-01-01T00:00:00.000Z",
  lastModified: "2023-01-01T12:00:00.000Z",
  revision: 5,
  documentType: "powerhouse/todolist",
  name: "My Todo List",
  slug: "my-todo-list",
  // ... other properties
}
```

**After (v4.0.0):**
```javascript
const document = {
  header: {
    id: "doc-123",
    createdAtUtcIso: "2023-01-01T00:00:00.000Z",
    lastModifiedAtUtcIso: "2023-01-01T12:00:00.000Z",
    revision: { global: 5, local: 0 },
    documentType: "powerhouse/todolist",
    name: "My Todo List",
    slug: "my-todo-list",
    branch: "main",
    sig: { nonce: "", publicKey: {} },
    meta: {}
  },
  // ... other properties
}
```

## Complete Property Migration Map

| **Old Property** | **New Property** | **Additional Changes** |
|------------------|------------------|------------------------|
| `document.id` | `document.header.id` | Now an Ed25519 signature for signed documents |
| `document.created` | `document.header.createdAtUtcIso` | **Renamed** to include UTC ISO specification |
| `document.lastModified` | `document.header.lastModifiedAtUtcIso` | **Renamed** to include UTC ISO specification |
| `document.revision` | `document.header.revision` | Now an **object** with scope keys (e.g., `{ global: 5, local: 0 }`) |
| `document.documentType` | `document.header.documentType` | No additional changes |
| `document.name` | `document.header.name` | No additional changes |
| `document.slug` | `document.header.slug` | No additional changes |
| `document.branch` | `document.header.branch` | Now explicitly included |
| `document.meta` | `document.header.meta` | Now explicitly included |
| N/A | `document.header.sig` | **New** - Signature information for document verification |

## Step-by-Step Migration Guide

### Step 1: Update Document Property Access

Replace all instances of direct property access with header-based access:

<details>
<summary>**Common Property Access Patterns**</summary>

**Document ID Access:**
```javascript
// Before
const documentId = document.id;

// After
const documentId = document.header.id;
```

**Document Name Access:**
```javascript
// Before
const documentName = document.name;

// After
const documentName = document.header.name;
```

**Document Type Access:**
```javascript
// Before
const docType = document.documentType;

// After
const docType = document.header.documentType;
```

**Timestamp Access:**
```javascript
// Before
const created = document.created;
const lastModified = document.lastModified;

// After
const created = document.header.createdAtUtcIso;
const lastModified = document.header.lastModifiedAtUtcIso;
```

**Revision Access:**
```javascript
// Before
const revision = document.revision; // Was a number

// After
const globalRevision = document.header.revision.global; // Now an object
const localRevision = document.header.revision.local;
// Or get all revisions
const allRevisions = document.header.revision; // { global: 5, local: 0, ... }
```

</details>

### Step 2: Update Component Code

**React Components:**

<details>
<summary>**Example: Document List Component**</summary>

```jsx
// Before
function DocumentList({ documents }) {
  return (
    <div>
      {documents.map(doc => (
        <div key={doc.id} className="document-item">
          <h3>{doc.name}</h3>
          <p>Type: {doc.documentType}</p>
          <p>Last modified: {new Date(doc.lastModified).toLocaleDateString()}</p>
          <p>Revision: {doc.revision}</p>
        </div>
      ))}
    </div>
  );
}

// After
function DocumentList({ documents }) {
  return (
    <div>
      {documents.map(doc => (
        <div key={doc.header.id} className="document-item">
          <h3>{doc.header.name}</h3>
          <p>Type: {doc.header.documentType}</p>
          <p>Last modified: {new Date(doc.header.lastModifiedAtUtcIso).toLocaleDateString()}</p>
          <p>Global Revision: {doc.header.revision.global}</p>
        </div>
      ))}
    </div>
  );
}
```

</details>

### Step 3: Update Type Definitions

If you're using TypeScript, update your type definitions:

<details>
<summary>**TypeScript Interface Updates**</summary>

```typescript
// Before
interface MyDocument {
  id: string;
  name: string;
  documentType: string;
  created: string;
  lastModified: string;
  revision: number;
  // ... other properties
}

// After
interface MyDocument {
  header: {
    id: string;
    name: string;
    documentType: string;
    createdAtUtcIso: string;
    lastModifiedAtUtcIso: string;
    revision: {
      [scope: string]: number;
    };
    slug: string;
    branch: string;
    sig: {
      nonce: string;
      publicKey: any;
    };
    meta?: {
      preferredEditor?: string;
    };
  };
  // ... other properties
}
```

</details>

### Step 4: Database Queries and APIs Compatibility

<details>
<summary>**GraphQL Query Compatibility**</summary>

**GraphQL Queries:**
```graphql
# Your existing queries continue to work unchanged
query GetDocument($id: ID!) {
  document(id: $id) {
    id              # Still works due to response transformation
    name            # Still works due to response transformation
    documentType    # Still works due to response transformation
    created         # Still works due to response transformation
    lastModified    # Still works due to response transformation
    revision        # Still works due to response transformation
  }
}
```

:::tip
**GraphQL Backward Compatibility:** The GraphQL API maintains backward compatibility through response transformation. Your existing queries will continue to work without changes. However, when working with the raw document objects in your application code, you'll need to use the new header structure.
:::

</details>





## Common Migration Issues and Solutions

### Issue 1: Undefined Property Errors

**Problem:** Getting `undefined` when accessing document properties.

**Solution:** Update property access to use the header structure:

```javascript
// This will be undefined after migration
const name = document.name;

// Use this instead
const name = document.header.name;
```

### Issue 2: Revision Type Mismatch

**Problem:** Code expecting revision to be a number but getting an object.

**Solution:** Update revision access to specify the scope:

```javascript
// Before - revision was a number
if (document.revision > 5) { ... }

// After - revision is an object with scope keys
if (document.header.revision.global > 5) { ... }
```

### Issue 3: Date Format Changes

**Problem:** Date parsing issues due to property name changes.

**Solution:** Update timestamp property names:

```javascript
// Before
const createdDate = new Date(document.created);
const modifiedDate = new Date(document.lastModified);

// After
const createdDate = new Date(document.header.createdAtUtcIso);
const modifiedDate = new Date(document.header.lastModifiedAtUtcIso);
```

## Testing Your Migration

### Automated Testing

Create tests to verify your migration:

<details>
<summary>**Migration Test Examples**</summary>

```javascript
// Test document property access
describe('Document Migration', () => {
  it('should access document properties correctly', () => {
    const mockDocument = {
      header: {
        id: 'test-id',
        name: 'Test Document',
        documentType: 'powerhouse/test',
        createdAtUtcIso: '2023-01-01T00:00:00.000Z',
        lastModifiedAtUtcIso: '2023-01-01T12:00:00.000Z',
        revision: { global: 5, local: 0 },
        // ... other header properties
      },
      // ... other document properties
    };

    // Test property access
    expect(mockDocument.header.id).toBe('test-id');
    expect(mockDocument.header.name).toBe('Test Document');
    expect(mockDocument.header.revision.global).toBe(5);
  });
});
```

</details>



## Related Documentation

- [PHDocument Architecture](/academy/Architecture/PowerhouseArchitecture)
- [Document Model Creation](/academy/MasteryTrack/DocumentModelCreation/WhatIsADocumentModel)
- [React Hooks](/academy/APIReferences/ReactHooks)

---

*This migration guide covers the major changes in v4.0.0. For additional technical details, refer to the [RELEASE-NOTES.md](https://github.com/powerhouse-dao/powerhouse/blob/main/RELEASE-NOTES.md) in the main repository.* 