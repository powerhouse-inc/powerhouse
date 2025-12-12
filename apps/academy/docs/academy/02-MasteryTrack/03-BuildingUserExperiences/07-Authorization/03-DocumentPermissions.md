# Document Permission System

:::warning Work in Progress
This documentation is still being written and may be incomplete.
The feature is not yet available on production. 
:::

The Reactor API includes a fine-grained document permission system that allows you to control access to individual documents, folders, and drives. This system works alongside the global role-based authorization to provide granular access control.

## Overview

The document permission system provides:

- **Document-level permissions**: Grant READ, WRITE, or ADMIN access to specific documents
- **Permission inheritance**: Permissions flow down from parent documents (drives → folders → documents)
- **Group-based access**: Organize users into groups and assign permissions to groups
- **Operation-level permissions**: Restrict specific operations to certain users or groups

## Prerequisites

Before using document permissions, you need:

1. **Renown authentication**: Users must authenticate via `ph login`
2. **AUTH_ENABLED=true**: Global authentication must be enabled
3. **DOCUMENT_PERMISSIONS_ENABLED=true**: Document permissions feature flag must be set

```bash
# Environment variables
AUTH_ENABLED=true
DOCUMENT_PERMISSIONS_ENABLED=true
```

## Permission Levels

The system defines three permission levels for documents:

| Level | Description | Capabilities |
|-------|-------------|--------------|
| `READ` | View access | Can fetch and read the document |
| `WRITE` | Edit access | Can push updates and modify the document |
| `ADMIN` | Full access | Can manage document permissions and settings |

Higher permission levels include all capabilities of lower levels (ADMIN includes WRITE and READ, WRITE includes READ).

## How It Works

### Permission Resolution

When a user attempts to access a document, the system checks permissions in this order:

1. **Global role check**: If AUTH_ENABLED is false, access is granted
2. **Direct user permission**: Check if user has explicit permission on the document
3. **Group permission**: Check if user belongs to a group with permission on the document
4. **Parent inheritance**: Recursively check parent documents (folder → drive)

```
Drive (ADMIN permission for user)
  └── Folder A (inherits ADMIN)
       └── Document 1 (inherits ADMIN)
       └── Document 2 (inherits ADMIN)
  └── Folder B (READ permission for user)
       └── Document 3 (inherits READ)
```

### Database Schema

The permission system uses six database tables:

| Table | Purpose |
|-------|---------|
| `DocumentPermission` | Direct user-document permissions |
| `Group` | Group definitions |
| `UserGroup` | User-group memberships |
| `DocumentGroupPermission` | Group-document permissions |
| `OperationUserPermission` | User-operation permissions |
| `OperationGroupPermission` | Group-operation permissions |

## GraphQL API

When `DOCUMENT_PERMISSIONS_ENABLED=true`, an Auth subgraph is registered with the following operations.

### Queries

#### Get document access info

```graphql
query GetDocumentAccess($documentId: String!) {
  documentAccess(documentId: $documentId) {
    documentId
    permissions {
      userAddress
      permission
      grantedBy
      createdAt
    }
    groupPermissions {
      groupId
      group {
        name
      }
      permission
      grantedBy
    }
  }
}
```

#### Get current user's document permissions

```graphql
query MyDocuments {
  userDocumentPermissions {
    documentId
    permission
    grantedBy
    createdAt
  }
}
```

#### List all groups

```graphql
query ListGroups {
  groups {
    id
    name
    description
    members
  }
}
```

#### Check operation permission

```graphql
query CanExecute($documentId: String!, $operation: String!) {
  canExecuteOperation(documentId: $documentId, operationType: $operation)
}
```

### Mutations

#### Grant user permission

```graphql
mutation GrantPermission($documentId: String!, $user: String!, $level: DocumentPermissionLevel!) {
  grantDocumentPermission(
    documentId: $documentId
    userAddress: $user
    permission: $level
  ) {
    documentId
    userAddress
    permission
  }
}
```

#### Revoke user permission

```graphql
mutation RevokePermission($documentId: String!, $user: String!) {
  revokeDocumentPermission(documentId: $documentId, userAddress: $user)
}
```

#### Create a group

```graphql
mutation CreateGroup($name: String!, $description: String) {
  createGroup(name: $name, description: $description) {
    id
    name
    description
  }
}
```

#### Add user to group

```graphql
mutation AddToGroup($user: String!, $groupId: Int!) {
  addUserToGroup(userAddress: $user, groupId: $groupId)
}
```

#### Grant group permission on document

```graphql
mutation GrantGroupAccess($documentId: String!, $groupId: Int!, $level: DocumentPermissionLevel!) {
  grantGroupPermission(
    documentId: $documentId
    groupId: $groupId
    permission: $level
  ) {
    documentId
    groupId
    permission
  }
}
```

#### Grant operation permission

```graphql
mutation GrantOperation($documentId: String!, $operation: String!, $user: String!) {
  grantOperationPermission(
    documentId: $documentId
    operationType: $operation
    userAddress: $user
  ) {
    documentId
    operationType
    userAddress
  }
}
```

## Configuration

### Environment Variables

```bash
# Enable authentication (required)
AUTH_ENABLED=true

# Enable document permissions feature
DOCUMENT_PERMISSIONS_ENABLED=true

# Global admin addresses (bypass all permission checks)
ADMINS="0x123...,0x456..."

# Global user addresses (basic access)
USERS="0x789...,0xabc..."

# Global guest addresses (read-only access)
GUESTS="0xdef...,0xghi..."

# Allow any authenticated user (free entry mode)
FREE_ENTRY=true
```

### powerhouse.config.json

```json
{
  "auth": {
    "enabled": true,
    "admins": ["0x123...", "0x456..."],
    "users": ["0x789...", "0xabc..."],
    "guests": ["0xdef...", "0xghi..."],
    "freeEntry": false
  }
}
```

## Usage Examples

### Setting Up Drive Permissions

When creating a new drive, grant yourself ADMIN access:

```graphql
mutation SetupDriveAdmin {
  grantDocumentPermission(
    documentId: "drive-id-here"
    userAddress: "0xYourAddress"
    permission: ADMIN
  ) {
    documentId
    permission
  }
}
```

### Creating a Team with Shared Access

1. Create a group:

```graphql
mutation CreateTeam {
  createGroup(name: "Engineering", description: "Engineering team") {
    id
    name
  }
}
```

2. Add team members:

```graphql
mutation AddMembers {
  alice: addUserToGroup(userAddress: "0xAlice", groupId: 1)
  bob: addUserToGroup(userAddress: "0xBob", groupId: 1)
  charlie: addUserToGroup(userAddress: "0xCharlie", groupId: 1)
}
```

3. Grant group access to a drive:

```graphql
mutation GrantTeamAccess {
  grantGroupPermission(
    documentId: "drive-id"
    groupId: 1
    permission: WRITE
  ) {
    documentId
    permission
  }
}
```

Now all Engineering team members can read and write documents in the drive.

### Restricting Specific Operations

You can restrict specific operations to certain users. For example, only allow admins to delete items:

```graphql
mutation RestrictDelete {
  grantOperationPermission(
    documentId: "drive-id"
    operationType: "DELETE_NODE"
    userAddress: "0xAdminAddress"
  ) {
    operationType
    userAddress
  }
}
```

When operation permissions are set, only users with explicit permission can execute that operation.

## Integration with Auth Flow

The document permission system integrates with the Renown authentication flow:

1. User authenticates via `ph login` → gets a Renown credential
2. User generates a bearer token via `ph access-token`
3. Bearer token is included in API requests
4. Reactor API verifies the token and extracts the user's address
5. Permission checks are performed using the user's address

```bash
# Generate access token
TOKEN=$(ph access-token --expiry 7d)

# Make authenticated request
curl -X POST http://localhost:4001/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "{ userDocumentPermissions { documentId permission } }"}'
```

## Best Practices

1. **Use groups for team access**: Instead of granting individual permissions, create groups and assign permissions to groups

2. **Grant ADMIN sparingly**: Only grant ADMIN permission to users who need to manage permissions

3. **Use permission inheritance**: Grant permissions at the drive or folder level, let them inherit down

4. **Document your permission structure**: Keep track of which groups have access to which drives

5. **Regular audits**: Periodically review permissions and remove stale access

## Troubleshooting

### Permission denied errors

1. Verify `AUTH_ENABLED=true` and `DOCUMENT_PERMISSIONS_ENABLED=true`
2. Check that the user has a valid Renown credential (`ph login --status`)
3. Verify the bearer token is valid and not expired
4. Check if the user has direct or group permission on the document
5. Check if permission is inherited from a parent document

### Migrations not running

Ensure database migrations have run:

```bash
# Migrations run automatically on startup when DOCUMENT_PERMISSIONS_ENABLED=true
# Check logs for "Document permission migrations completed"
```

### Group permissions not working

1. Verify the user is a member of the group: `userGroups(userAddress: "0x...")`
2. Verify the group has permission on the document: `documentAccess(documentId: "...")`
3. Check that group membership was created before permission check
