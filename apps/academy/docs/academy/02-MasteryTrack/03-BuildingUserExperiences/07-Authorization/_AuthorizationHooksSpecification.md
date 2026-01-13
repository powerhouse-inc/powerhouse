# Authorization Hooks Specification

WARNING: AI Exploration for Discussion with the team. Not for live publication.

This document specifies the React hooks needed to integrate the Powerhouse authorization system (global role-based authorization and document permissions) into frontend applications.

## Overview

**Current State:** The authorization system is fully implemented in the Reactor API with GraphQL queries and mutations, but there are no React hooks to consume this functionality in frontend applications.

**Gap:** Frontend developers need React hooks that:
- Expose the current user's authentication state and role
- Check document-level permissions efficiently
- Enable permission-aware UI rendering
- Integrate seamlessly with existing document and drive hooks

**Goal:** Provide a complete set of hooks that make authorization a first-class concern in the frontend, following the same patterns as existing hooks in `@powerhousedao/reactor-browser`.

---

## Architecture Principles

### 1. Separation of Concerns

Authorization hooks should follow the existing architectural patterns:
- **Data hooks** (`useCurrentUser`, `useDocumentPermission`): Read authorization state
- **Action hooks** (`useGrantPermission`, `useRevokePermission`): Modify permissions
- **Composite hooks** (`useSelectedDocumentWithPermission`): Combine authorization with existing functionality

### 2. Integration with Reactor

All authorization data should flow through the Reactor, just like document and drive data:
- The Reactor already manages GraphQL connections to the Reactor API
- Authorization state should be cached and synchronized like document state
- Hooks should subscribe to authorization changes via the Reactor's observable pattern

### 3. Performance Considerations

- **Cache permission checks**: Avoid redundant GraphQL queries by caching permission data
- **Batch requests**: When checking multiple documents, batch permission queries
- **Optimistic reads**: Use cached data for permission checks, refresh in background
- **Lazy loading**: Only fetch detailed permission data (groups, operation permissions) when needed

### 4. Error Handling

- Gracefully handle unauthenticated state (return `undefined` or `null`)
- Distinguish between "no permission" and "permission unknown/loading"
- Provide clear error states for permission-related failures

---

## Core Authorization Hooks

### Current User & Authentication

#### `useCurrentUser`

Returns the currently authenticated user's information.

```typescript
function useCurrentUser(): {
  address: string;           // Ethereum address
  did?: string;              // Decentralized Identifier
  isAuthenticated: boolean;  // True if user has valid token
  globalRole: 'ADMIN' | 'USER' | 'GUEST' | undefined;
} | undefined
```

**Returns:** User information object, or `undefined` if not authenticated.

**Implementation notes:**
- Should extract user info from the bearer token stored in the Reactor
- Subscribe to auth state changes (login/logout events)
- Should validate token expiry and update state when token expires

**Example:**

```tsx
import { useCurrentUser } from '@powerhousedao/reactor-browser';

function UserProfileBadge() {
  const user = useCurrentUser();
  
  if (!user) {
    return <LoginPrompt />;
  }
  
  return (
    <div>
      <span>{user.address.slice(0, 6)}...{user.address.slice(-4)}</span>
      <Badge>{user.globalRole}</Badge>
    </div>
  );
}
```

---

#### `useIsAuthenticated`

Returns whether the user is currently authenticated.

```typescript
function useIsAuthenticated(): boolean
```

**Returns:** `true` if user has valid authentication token, `false` otherwise.

**Example:**

```tsx
function ProtectedRoute() {
  const isAuthenticated = useIsAuthenticated();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  return <Outlet />;
}
```

---

#### `useHasGlobalRole`

Checks if the current user has a specific global role or higher.

```typescript
function useHasGlobalRole(
  role: 'ADMIN' | 'USER' | 'GUEST'
): boolean
```

**Parameters:**
- `role` — The minimum required global role

**Returns:** `true` if user has the specified role or higher (ADMIN > USER > GUEST).

**Example:**

```tsx
function AdminPanel() {
  const isAdmin = useHasGlobalRole('ADMIN');
  
  if (!isAdmin) {
    return <AccessDenied />;
  }
  
  return <AdminDashboard />;
}
```

---

### Document Permissions

#### `useDocumentPermission`

Returns the current user's permission level for a specific document.

```typescript
function useDocumentPermission(
  documentId: string | null | undefined
): {
  permission: 'ADMIN' | 'WRITE' | 'READ' | undefined;
  isLoading: boolean;
  error?: Error;
  source: 'direct' | 'group' | 'inherited' | 'none';
  refresh: () => Promise<void>;
} | undefined
```

**Parameters:**
- `documentId` — The document ID to check permissions for, or `null`/`undefined` to skip

**Returns:** Permission information object, or `undefined` if documentId is null/undefined.

**Fields:**
- `permission` — The user's permission level, or `undefined` if no permission
- `isLoading` — True while permission check is in progress
- `error` — Any error that occurred during permission check
- `source` — How the permission was derived (direct assignment, group membership, parent inheritance)
- `refresh` — Function to force refresh the permission from the server

**Implementation notes:**
- Should check permission cache first, then query GraphQL if not cached
- Should handle permission inheritance (check parent folders/drives)
- Should check both direct user permissions and group permissions
- Should subscribe to permission changes for the document

**Example:**

```tsx
import { useDocumentPermission } from '@powerhousedao/reactor-browser';

function DocumentEditor({ documentId }: { documentId: string }) {
  const { permission, isLoading } = useDocumentPermission(documentId);
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  const canEdit = permission === 'WRITE' || permission === 'ADMIN';
  
  return (
    <div>
      {canEdit ? <EditableDocument /> : <ReadOnlyDocument />}
    </div>
  );
}
```

---

#### `useCanRead`

Checks if the current user can read a document.

```typescript
function useCanRead(
  documentId: string | null | undefined
): boolean
```

**Parameters:**
- `documentId` — The document ID to check

**Returns:** `true` if user has READ, WRITE, or ADMIN permission.

---

#### `useCanWrite`

Checks if the current user can write to a document.

```typescript
function useCanWrite(
  documentId: string | null | undefined
): boolean
```

**Parameters:**
- `documentId` — The document ID to check

**Returns:** `true` if user has WRITE or ADMIN permission.

---

#### `useCanAdmin`

Checks if the current user can administer a document (manage permissions).

```typescript
function useCanAdmin(
  documentId: string | null | undefined
): boolean
```

**Parameters:**
- `documentId` — The document ID to check

**Returns:** `true` if user has ADMIN permission.

**Example:**

```tsx
function DocumentToolbar({ documentId }: { documentId: string }) {
  const canWrite = useCanWrite(documentId);
  const canAdmin = useCanAdmin(documentId);
  
  return (
    <Toolbar>
      {canWrite && (
        <>
          <EditButton />
          <SaveButton />
        </>
      )}
      {canAdmin && <PermissionsButton />}
    </Toolbar>
  );
}
```

---

#### `useCanExecuteOperation`

Checks if the current user can execute a specific operation on a document.

```typescript
function useCanExecuteOperation(
  documentId: string | null | undefined,
  operationType: string | null | undefined
): boolean
```

**Parameters:**
- `documentId` — The document ID to check
- `operationType` — The operation type (e.g., "DELETE_NODE", "ADD_FOLDER")

**Returns:** `true` if user has permission to execute the operation.

**Implementation notes:**
- Should check if operation permissions are configured for the document
- If no operation-specific permissions exist, fall back to document permission level
- Should cache operation permission checks

**Example:**

```tsx
function NodeContextMenu({ node, documentId }: Props) {
  const canDelete = useCanExecuteOperation(documentId, 'DELETE_NODE');
  const canRename = useCanExecuteOperation(documentId, 'RENAME_NODE');
  
  return (
    <Menu>
      {canRename && <MenuItem>Rename</MenuItem>}
      {canDelete && <MenuItem>Delete</MenuItem>}
    </Menu>
  );
}
```

---

#### `useDocumentAccess`

Returns detailed access information for a document, including all users and groups with permissions.

```typescript
function useDocumentAccess(
  documentId: string | null | undefined
): {
  documentId: string;
  userPermissions: Array<{
    userAddress: string;
    permission: 'ADMIN' | 'WRITE' | 'READ';
    grantedBy: string;
    createdAt: string;
  }>;
  groupPermissions: Array<{
    groupId: number;
    groupName: string;
    permission: 'ADMIN' | 'WRITE' | 'READ';
    grantedBy: string;
  }>;
  isLoading: boolean;
  error?: Error;
  refresh: () => Promise<void>;
} | undefined
```

**Parameters:**
- `documentId` — The document ID to get access information for

**Returns:** Detailed access information, or `undefined` if documentId is null/undefined.

**Usage:** This hook is primarily for admins managing document permissions.

**Example:**

```tsx
function PermissionsManager({ documentId }: { documentId: string }) {
  const access = useDocumentAccess(documentId);
  const canAdmin = useCanAdmin(documentId);
  
  if (!canAdmin) {
    return <AccessDenied />;
  }
  
  if (!access || access.isLoading) {
    return <LoadingSpinner />;
  }
  
  return (
    <div>
      <h2>User Permissions</h2>
      <PermissionsList permissions={access.userPermissions} />
      
      <h2>Group Permissions</h2>
      <GroupPermissionsList permissions={access.groupPermissions} />
    </div>
  );
}
```

---

#### `useUserDocumentPermissions`

Returns all documents the current user has explicit permissions for.

```typescript
function useUserDocumentPermissions(): Array<{
  documentId: string;
  permission: 'ADMIN' | 'WRITE' | 'READ';
  grantedBy: string;
  createdAt: string;
}> | undefined
```

**Returns:** Array of documents with their permission levels.

**Usage:** Useful for showing a user all documents they have access to.

---

### Group Management

#### `useUserGroups`

Returns all groups the current user belongs to.

```typescript
function useUserGroups(): Array<{
  id: number;
  name: string;
  description?: string;
  memberCount?: number;
}> | undefined
```

**Returns:** Array of groups, or `undefined` if not loaded.

**Example:**

```tsx
function UserGroupsBadge() {
  const groups = useUserGroups();
  
  if (!groups || groups.length === 0) {
    return null;
  }
  
  return (
    <div>
      <span>Member of: </span>
      {groups.map(group => (
        <Badge key={group.id}>{group.name}</Badge>
      ))}
    </div>
  );
}
```

---

#### `useGroups`

Returns all groups (admin only).

```typescript
function useGroups(): {
  groups: Array<{
    id: number;
    name: string;
    description?: string;
    members: string[];
  }>;
  isLoading: boolean;
  error?: Error;
  refresh: () => Promise<void>;
} | undefined
```

**Returns:** All groups with member lists, or `undefined` if user doesn't have admin access.

**Usage:** For admin interfaces managing groups.

---

#### `useIsInGroup`

Checks if the current user is a member of a specific group.

```typescript
function useIsInGroup(groupId: number | null | undefined): boolean
```

**Parameters:**
- `groupId` — The group ID to check membership for

**Returns:** `true` if user is a member of the group.

---

### Permission Actions

#### `useGrantDocumentPermission`

Returns a function to grant document permission to a user.

```typescript
function useGrantDocumentPermission(): (
  documentId: string,
  userAddress: string,
  permission: 'ADMIN' | 'WRITE' | 'READ'
) => Promise<void>
```

**Returns:** An async function that grants permission.

**Throws:** Error if user doesn't have ADMIN permission on the document.

**Example:**

```tsx
function GrantPermissionForm({ documentId }: { documentId: string }) {
  const grantPermission = useGrantDocumentPermission();
  const [userAddress, setUserAddress] = useState('');
  const [level, setLevel] = useState<'READ' | 'WRITE' | 'ADMIN'>('READ');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await grantPermission(documentId, userAddress, level);
      alert('Permission granted successfully');
    } catch (error) {
      alert(`Failed: ${error.message}`);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input 
        value={userAddress} 
        onChange={e => setUserAddress(e.target.value)}
        placeholder="User address"
      />
      <select value={level} onChange={e => setLevel(e.target.value)}>
        <option value="READ">Read</option>
        <option value="WRITE">Write</option>
        <option value="ADMIN">Admin</option>
      </select>
      <button type="submit">Grant Permission</button>
    </form>
  );
}
```

---

#### `useRevokeDocumentPermission`

Returns a function to revoke document permission from a user.

```typescript
function useRevokeDocumentPermission(): (
  documentId: string,
  userAddress: string
) => Promise<void>
```

**Returns:** An async function that revokes permission.

**Throws:** Error if user doesn't have ADMIN permission on the document.

---

#### `useGrantGroupPermission`

Returns a function to grant document permission to a group.

```typescript
function useGrantGroupPermission(): (
  documentId: string,
  groupId: number,
  permission: 'ADMIN' | 'WRITE' | 'READ'
) => Promise<void>
```

---

#### `useRevokeGroupPermission`

Returns a function to revoke document permission from a group.

```typescript
function useRevokeGroupPermission(): (
  documentId: string,
  groupId: number
) => Promise<void>
```

---

#### `useCreateGroup`

Returns a function to create a new group.

```typescript
function useCreateGroup(): (
  name: string,
  description?: string
) => Promise<{ id: number; name: string; description?: string }>
```

**Returns:** An async function that creates a group and returns the created group.

**Throws:** Error if user doesn't have appropriate permissions.

---

#### `useAddUserToGroup`

Returns a function to add a user to a group.

```typescript
function useAddUserToGroup(): (
  groupId: number,
  userAddress: string
) => Promise<void>
```

---

#### `useRemoveUserFromGroup`

Returns a function to remove a user from a group.

```typescript
function useRemoveUserFromGroup(): (
  groupId: number,
  userAddress: string
) => Promise<void>
```

---

#### `useGrantOperationPermission`

Returns a function to grant operation-specific permission.

```typescript
function useGrantOperationPermission(): (
  documentId: string,
  operationType: string,
  userAddress: string
) => Promise<void>
```

---

#### `useRevokeOperationPermission`

Returns a function to revoke operation-specific permission.

```typescript
function useRevokeOperationPermission(): (
  documentId: string,
  operationType: string,
  userAddress: string
) => Promise<void>
```

---

## Integration with Existing Hooks

### Permission-Aware Document Hooks

These hooks enhance existing document hooks with permission information.

#### `useSelectedDocumentWithPermission`

Extends `useSelectedDocument` to include permission information.

```typescript
function useSelectedDocumentWithPermission(): readonly [
  document: PHDocument | undefined,
  dispatch: DocumentDispatch,
  permission: {
    level: 'ADMIN' | 'WRITE' | 'READ' | undefined;
    canRead: boolean;
    canWrite: boolean;
    canAdmin: boolean;
    isLoading: boolean;
  }
]
```

**Returns:** A tuple `[document, dispatch, permission]`.

**Example:**

```tsx
function SmartDocumentEditor() {
  const [document, dispatch, permission] = useSelectedDocumentWithPermission();
  
  if (!document) {
    return <NoDocumentSelected />;
  }
  
  if (permission.isLoading) {
    return <LoadingPermissions />;
  }
  
  if (!permission.canRead) {
    return <AccessDenied />;
  }
  
  return (
    <DocumentView 
      document={document}
      dispatch={dispatch}
      readOnly={!permission.canWrite}
    />
  );
}
```

---

#### `useDocumentByIdWithPermission`

Extends `useDocumentById` to include permission information.

```typescript
function useDocumentByIdWithPermission(
  id: string | null | undefined
): readonly [
  document: PHDocument | undefined,
  dispatch: DocumentDispatch,
  permission: {
    level: 'ADMIN' | 'WRITE' | 'READ' | undefined;
    canRead: boolean;
    canWrite: boolean;
    canAdmin: boolean;
  }
]
```

---

#### `useDocumentsWithPermission`

Returns documents filtered by minimum permission level.

```typescript
function useDocumentsWithPermission(
  documentIds: string[],
  minPermission: 'READ' | 'WRITE' | 'ADMIN'
): PHDocument[]
```

**Parameters:**
- `documentIds` — Array of document IDs to check
- `minPermission` — Minimum required permission level

**Returns:** Array of documents the user has at least the specified permission for.

**Example:**

```tsx
function EditableDocumentsList() {
  const allDocumentIds = useAllDocumentIds();
  const editableDocs = useDocumentsWithPermission(allDocumentIds, 'WRITE');
  
  return (
    <ul>
      {editableDocs.map(doc => (
        <li key={doc.header.id}>
          {doc.name} <EditIcon />
        </li>
      ))}
    </ul>
  );
}
```

---

#### `useFilteredNodesInSelectedDrive`

Returns nodes in the selected drive filtered by permission.

```typescript
function useFilteredNodesInSelectedDrive(
  minPermission?: 'READ' | 'WRITE' | 'ADMIN'
): Node[] | undefined
```

**Parameters:**
- `minPermission` — Optional minimum permission filter

**Returns:** Array of nodes the user has access to.

---

### Enhanced Node Actions

#### `useNodeActionsWithPermissionChecks`

Extends `useNodeActions` to automatically check permissions before executing actions.

```typescript
function useNodeActionsWithPermissionChecks(): {
  onAddFile: (file: File, parent: Node | undefined) => Promise<Node | undefined>;
  onAddFolder: (name: string, parent: Node | undefined) => Promise<Node | undefined>;
  onRenameNode: (newName: string, node: Node) => Promise<Node | undefined>;
  onCopyNode: (src: Node, target: Node | undefined) => Promise<void>;
  onMoveNode: (src: Node, target: Node | undefined) => Promise<void>;
  onDuplicateNode: (src: Node) => Promise<void>;
  onDeleteNode: (node: Node) => Promise<void>;
  onAddAndSelectNewFolder: (name: string) => Promise<void>;
  permissions: {
    canAddFile: boolean;
    canAddFolder: boolean;
    canRename: boolean;
    canCopy: boolean;
    canMove: boolean;
    canDelete: boolean;
  };
}
```

**Returns:** Enhanced node actions that:
- Check permissions before executing
- Throw clear errors if user lacks permission
- Include a `permissions` object indicating what actions are available

**Example:**

```tsx
function DriveToolbar() {
  const { onAddFolder, onDeleteNode, permissions } = useNodeActionsWithPermissionChecks();
  const selectedNode = useSelectedNode();
  
  return (
    <Toolbar>
      {permissions.canAddFolder && (
        <button onClick={() => onAddFolder('New Folder', undefined)}>
          New Folder
        </button>
      )}
      {permissions.canDelete && selectedNode && (
        <button onClick={() => onDeleteNode(selectedNode)}>
          Delete
        </button>
      )}
    </Toolbar>
  );
}
```

---

## Declarative Components

### `RequirePermission`

A component that conditionally renders children based on permission checks.

```tsx
interface RequirePermissionProps {
  documentId: string;
  permission: 'READ' | 'WRITE' | 'ADMIN';
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

function RequirePermission(props: RequirePermissionProps): JSX.Element
```

**Props:**
- `documentId` — The document to check permissions for
- `permission` — The required permission level
- `fallback` — Optional element to render if permission check fails
- `children` — Content to render if permission check passes

**Example:**

```tsx
<RequirePermission 
  documentId={documentId} 
  permission="WRITE"
  fallback={<ReadOnlyBanner />}
>
  <EditControls />
</RequirePermission>
```

---

### `RequireGlobalRole`

A component that conditionally renders based on global role.

```tsx
interface RequireGlobalRoleProps {
  role: 'ADMIN' | 'USER' | 'GUEST';
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

function RequireGlobalRole(props: RequireGlobalRoleProps): JSX.Element
```

---

### `RequireAuthentication`

A component that requires the user to be authenticated.

```tsx
interface RequireAuthenticationProps {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

function RequireAuthentication(props: RequireAuthenticationProps): JSX.Element
```

**Example:**

```tsx
<RequireAuthentication fallback={<LoginPrompt />}>
  <UserDashboard />
</RequireAuthentication>
```

---

## Context Providers

### `PermissionProvider`

A context provider that pre-fetches and caches permission data for descendants.

```tsx
interface PermissionProviderProps {
  documentIds?: string[];  // Optional: documents to pre-fetch permissions for
  children: React.ReactNode;
}

function PermissionProvider(props: PermissionProviderProps): JSX.Element
```

**Usage:** Wrap your app or a section of your app to optimize permission checks.

```tsx
<PermissionProvider documentIds={[driveId, ...documentIds]}>
  <DocumentExplorer />
</PermissionProvider>
```

**Implementation notes:**
- Should batch fetch permissions for all specified documents on mount
- Should subscribe to permission changes and update cache
- Should provide cached permission data to descendant hooks
- Should handle permission cache invalidation

---

## Implementation Considerations

### 1. GraphQL Integration

All authorization hooks should use GraphQL queries/mutations from the Auth subgraph:

**Queries:**
- `documentAccess(documentId: String!)`
- `userDocumentPermissions`
- `groups`
- `userGroups(userAddress: String!)`
- `canExecuteOperation(documentId: String!, operationType: String!)`

**Mutations:**
- `grantDocumentPermission(documentId, userAddress, permission)`
- `revokeDocumentPermission(documentId, userAddress)`
- `grantGroupPermission(documentId, groupId, permission)`
- `createGroup(name, description)`
- `addUserToGroup(userAddress, groupId)`
- `grantOperationPermission(documentId, operationType, userAddress)`

### 2. Caching Strategy

**Permission Cache Structure:**
```typescript
interface PermissionCache {
  // User's permissions by document ID
  userPermissions: Map<string, {
    permission: 'ADMIN' | 'WRITE' | 'READ' | undefined;
    source: 'direct' | 'group' | 'inherited';
    timestamp: number;
    ttl: number;
  }>;
  
  // Document access info (for admins)
  documentAccess: Map<string, DocumentAccessInfo>;
  
  // User's groups
  userGroups: Array<Group> | undefined;
  
  // All groups (for admins)
  allGroups: Array<Group> | undefined;
  
  // Operation permissions by document
  operationPermissions: Map<string, Map<string, boolean>>;
}
```

**Cache Invalidation:**
- Invalidate on permission mutations (grant/revoke)
- Set TTL for permission checks (e.g., 5 minutes)
- Provide manual refresh functions
- Subscribe to real-time permission updates via GraphQL subscriptions if available

### 3. Error States

Hooks should distinguish between:
- **Loading**: Permission check in progress
- **No access**: User definitely doesn't have permission
- **Error**: Permission check failed (network error, etc.)
- **Unknown**: Permission hasn't been checked yet

### 4. Optimistic Updates

When granting/revoking permissions:
- Update local cache immediately (optimistic)
- Show success state to user
- Revert if mutation fails
- Refresh affected permission queries

### 5. Batch Operations

When checking permissions for multiple documents:
```typescript
// Bad: Multiple sequential queries
for (const docId of documentIds) {
  const permission = await checkPermission(docId);
}

// Good: Single batched query
const permissions = await checkPermissions(documentIds);
```

### 6. React Concurrent Mode

Hooks should be compatible with React 18+ concurrent features:
- Use `useTransition` for non-urgent permission updates
- Support Suspense for permission loading states
- Avoid tearing in concurrent renders

### 7. TypeScript Support

All hooks should have full TypeScript support:
- Generic type parameters where appropriate
- Discriminated unions for loading/error states
- Strict null checks for optional parameters

### 8. Testing

Each hook should have:
- Unit tests with mocked Reactor
- Integration tests with real GraphQL queries
- Tests for error cases and edge conditions
- Performance tests for caching behavior

---

## Migration Path

### Phase 1: Core Hooks (MVP)
- `useCurrentUser`
- `useIsAuthenticated`
- `useDocumentPermission`
- `useCanRead`, `useCanWrite`, `useCanAdmin`

### Phase 2: Permission Actions
- `useGrantDocumentPermission`
- `useRevokeDocumentPermission`
- `useDocumentAccess`

### Phase 3: Group Management
- `useUserGroups`
- `useGroups`
- `useCreateGroup`
- `useAddUserToGroup`

### Phase 4: Integration
- `useSelectedDocumentWithPermission`
- `useNodeActionsWithPermissionChecks`
- `useFilteredNodesInSelectedDrive`

### Phase 5: Advanced Features
- `RequirePermission` component
- `PermissionProvider` context
- Operation-level permission hooks
- Batch permission checks

---

## Usage Patterns & Best Practices

### Pattern 1: Permission-Based Rendering

```tsx
function DocumentCard({ documentId }: Props) {
  const [document] = useDocumentById(documentId);
  const canWrite = useCanWrite(documentId);
  const canAdmin = useCanAdmin(documentId);
  
  return (
    <Card>
      <CardHeader>{document?.name}</CardHeader>
      <CardBody>
        {/* Always show read view */}
        <DocumentPreview document={document} />
      </CardBody>
      <CardFooter>
        {canWrite && <EditButton documentId={documentId} />}
        {canAdmin && <PermissionsButton documentId={documentId} />}
      </CardFooter>
    </Card>
  );
}
```

### Pattern 2: Permission-Aware Dispatch

```tsx
function usePermissionAwareDispatch(documentId: string) {
  const [document, dispatch] = useDocumentById(documentId);
  const { permission, canWrite } = useDocumentPermission(documentId);
  
  const safeDispatch = useCallback((action: Action) => {
    if (!canWrite) {
      throw new Error('You do not have permission to edit this document');
    }
    dispatch(action);
  }, [canWrite, dispatch]);
  
  return [document, safeDispatch, permission] as const;
}
```

### Pattern 3: Loading States

```tsx
function DocumentEditor({ documentId }: Props) {
  const [document] = useDocumentById(documentId);
  const { permission, isLoading, error } = useDocumentPermission(documentId);
  
  // Show loading state while checking permissions
  if (isLoading) {
    return <PermissionLoadingSpinner />;
  }
  
  // Show error if permission check failed
  if (error) {
    return <PermissionError error={error} />;
  }
  
  // Show access denied if no read permission
  if (!permission?.canRead) {
    return <AccessDenied documentId={documentId} />;
  }
  
  // Render editor (read-only if no write permission)
  return (
    <Editor 
      document={document}
      readOnly={!permission.canWrite}
    />
  );
}
```

### Pattern 4: Prefetching Permissions

```tsx
function DocumentExplorer() {
  const documentIds = useFileNodesInSelectedDrive()?.map(n => n.documentId) ?? [];
  
  // Wrap in PermissionProvider to prefetch all permissions
  return (
    <PermissionProvider documentIds={documentIds}>
      <DocumentGrid documentIds={documentIds} />
    </PermissionProvider>
  );
}

function DocumentGrid({ documentIds }: Props) {
  // These hooks will use cached permissions from PermissionProvider
  return (
    <div className="grid">
      {documentIds.map(id => (
        <DocumentCard key={id} documentId={id} />
      ))}
    </div>
  );
}
```

### Pattern 5: Optimistic Updates

```tsx
function GrantPermissionButton({ documentId, userAddress }: Props) {
  const grantPermission = useGrantDocumentPermission();
  const { refresh } = useDocumentAccess(documentId);
  const [isPending, startTransition] = useTransition();
  
  const handleGrant = () => {
    startTransition(async () => {
      try {
        await grantPermission(documentId, userAddress, 'WRITE');
        await refresh(); // Refresh to show new permission
        toast.success('Permission granted');
      } catch (error) {
        toast.error(`Failed: ${error.message}`);
      }
    });
  };
  
  return (
    <button onClick={handleGrant} disabled={isPending}>
      {isPending ? 'Granting...' : 'Grant Write Access'}
    </button>
  );
}
```

---

## Security Considerations

1. **Never trust client-side permission checks**: Always validate permissions on the server
2. **Cache permission data securely**: Don't expose other users' permissions
3. **Handle token expiry gracefully**: Refresh tokens or prompt re-authentication
4. **Rate limit permission queries**: Prevent abuse of permission checking
5. **Audit permission changes**: Log all grant/revoke operations
6. **Validate permission hierarchy**: Ensure WRITE doesn't grant ADMIN capabilities

---

## Performance Benchmarks

Target performance metrics for authorization hooks:

- **Permission check (cached)**: < 1ms
- **Permission check (uncached)**: < 100ms
- **Batch permission check (10 documents)**: < 200ms
- **Permission grant/revoke**: < 500ms
- **Group membership check**: < 50ms
- **Cache invalidation**: < 10ms

---

## Open Questions

1. **Should permissions be reactive?** If permissions change on the server (e.g., admin revokes access), should the UI update in real-time via subscriptions?

2. **How to handle permission conflicts?** If a user has READ via one group and WRITE via another, which takes precedence? (Proposal: highest permission wins)

3. **Should we support permission requests?** Allow users to request access to documents they can't currently view?

4. **How to handle offline mode?** Should cached permissions remain valid offline, or should all permission checks fail?

5. **Should we expose permission reasoning?** Show users why they have access (e.g., "You have WRITE access because you're in the Engineering group")

6. **How granular should operation permissions be?** Should every operation type be permission-checked, or just critical ones?

---

## Related Documentation

- [Document Permission System](./02-DocumentPermissions.md) - Backend implementation
- [Reactor API Authorization](./04-Authorization.md) - Global role-based access
- [Renown Authentication Flow](./01-RenownAuthenticationFlow.md) - User authentication
- [React Hooks Reference](../../04-APIReferences/01-ReactHooks.md) - Existing hooks
- [Working with the Reactor](../../05-Architecture/01-WorkingWithTheReactor.md) - Reactor architecture

---

## Feedback & Contributions

This specification is a living document. If you're implementing these hooks or using them in production:

- **Report issues**: Document edge cases or missing functionality
- **Suggest improvements**: Propose better APIs or patterns
- **Share usage patterns**: Help us understand real-world use cases
- **Contribute examples**: Add practical examples from your implementations

---

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Status:** Draft Specification  
**Next Review:** After MVP implementation

