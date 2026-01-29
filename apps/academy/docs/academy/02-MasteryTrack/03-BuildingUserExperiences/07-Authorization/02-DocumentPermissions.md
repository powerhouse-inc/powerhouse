# Document Permission System

:::warning Work in Progress
This documentation is still being written and may be incomplete.
The feature is not yet available on production.
:::

## Introduction

The **Reactor API** is the API interface to a Powerhouse **Reactor**—a storage node responsible for storing documents, resolving conflicts, and verifying document event histories. Reactors can be configured for local storage, cloud storage, or decentralized storage networks.

Within a Reactor, data is organized hierarchically:

- **Drives**: Logical containers for organizing collections of documents (similar to a repository)
- **Folders**: Subdirectories within drives for organizing documents
- **Documents**: Individual Powerhouse documents based on document models (e.g., todo lists, budgets, specifications)

### Why Document Permissions?

The Reactor API implements a two-layer authorization system:

| Layer       | System                                                       | Purpose                                              | Scope        |
| ----------- | ------------------------------------------------------------ | ---------------------------------------------------- | ------------ |
| **Layer 1** | [**Global Role-Based Authorization**](./04-Authorization.md) | Controls who can access the Reactor API              | Reactor-wide |
| **Layer 2** | **Document Permission System** (this guide)                  | Controls access to specific documents/folders/drives | Per-document |

This document permission system allows you to implement fine-grained access control—for example, you might want certain team members to have write access to a "Marketing" drive while only having read access to a "Finance" drive, even though they're both authenticated users of your Reactor.

:::info Prerequisites: Global Authorization First
Before using document permissions, you must configure [global role-based authorization](./04-Authorization.md). Users need a global role (GUEST, USER, or ADMIN) to access the Reactor API before document-level permissions are checked.

**Reminder:** You can also enable `FREE_ENTRY=true` to allow any authenticated user with a valid Renown credential to access the Reactor, bypassing the need for explicit role assignments.
:::

## Overview

The document permission system provides:

- **Document-level permissions**: Grant READ, WRITE, or ADMIN access to specific documents
- **Permission inheritance**: Permissions flow down from parent documents (drives → folders → documents)
- **Group-based access**: Organize users into groups and assign permissions to groups
- **Operation-level permissions**: Restrict specific operations to certain users or groups

## Prerequisites

Before using document permissions, you need:

1. **A running Reactor**: Start a local Reactor instance
2. **Renown authentication**: Users must authenticate via `ph login` via the CLI
3. **AUTH_ENABLED=true**: Global authentication must be enabled
4. **DOCUMENT_PERMISSIONS_ENABLED=true**: Document permissions feature flag must be set

### Starting the Reactor API

The Reactor API is started when you run a local Reactor instance. You have several options:

**Option 1: Run Reactor directly**

```bash
# Start a local Reactor on port 4001 (default)
ph reactor

# Or specify a custom port
ph reactor --port 5000
```

**Option 2: Run both Connect and Reactor together**

```bash
# Start both Connect and Reactor for development
ph dev
```

All options will start a Reactor API instance, typically accessible at:

- **GraphQL API**: `http://localhost:4001/graphql`
- **Drive endpoint**: `http://localhost:4001/d/powerhouse`

### Accessing Remote/Production Reactors

For production or remote Reactor instances (e.g., hosted on Vetra):

- The Reactor is already running on a remote server
- Access it via the remote URL (e.g., `https://vetra.example.com/d/your-drive-id`)
- You still need to authenticate with `ph login` and obtain an access token
- Include your bearer token in API requests to the remote Reactor's GraphQL endpoint via an header of the type 'Authorization'

### Configuring Authentication

Once the Reactor is running, enable authentication in your `powerhouse.config.json` or via environment variables:

```bash
# Environment variables
AUTH_ENABLED=true
DOCUMENT_PERMISSIONS_ENABLED=true
```

Or in `powerhouse.config.json`:

```json
{
  "auth": {
    "enabled": true
  }
}
```

After configuration changes, restart the Reactor for settings to take effect.

## Quick Start

Here's the complete flow to set up and use document permissions:

1. **Start the Reactor with auth enabled**:

   ```bash
   # Set environment variables
   export AUTH_ENABLED=true
   export DOCUMENT_PERMISSIONS_ENABLED=true

   # Start the Reactor
   ph reactor
   ```

2. **Authenticate as a user**:

   ```bash
   # Login via Renown
   ph login

   # Generate an access token
   ph access-token --expiry 7d
   ```

3. **Grant yourself admin access to a drive** (via GraphQL or programmatically when creating the drive)

4. **Grant permissions to other users or groups** using the GraphQL mutations described below

## Permission Levels

The system defines three permission levels for documents:

| Level   | Description | Capabilities                                 |
| ------- | ----------- | -------------------------------------------- |
| `READ`  | View access | Can fetch and read the document              |
| `WRITE` | Edit access | Can push updates and modify the document     |
| `ADMIN` | Full access | Can manage document permissions and settings |

**Permission hierarchy**: Higher permission levels include all capabilities of lower levels (ADMIN includes WRITE and READ, WRITE includes READ).

:::tip Practical Examples

- **READ**: A team member can view a budget document but cannot make changes
- **WRITE**: A contributor can edit a specification document and push updates
- **ADMIN**: A project lead can modify who has access to the entire project drive
  :::

## How It Works

### Permission Resolution

When a user attempts to access a document, the Reactor API checks permissions in this order:

1. **[Global role check](./04-Authorization.md)**: First, verify the user has a global role (ADMIN/USER/GUEST). If `AUTH_ENABLED=false`, access is granted to everyone. If `FREE_ENTRY=true`, any authenticated user with a valid Renown credential can access the Reactor
2. **Direct user permission**: Check if the user has explicit permission on the document
3. **Group permission**: Check if the user belongs to a group with permission on the document
4. **Parent inheritance**: Recursively check parent documents (folder → drive)

**Example of permission inheritance:**

```
Drive (ADMIN permission for user Alice)
  └── Folder A (inherits ADMIN from Drive)
       └── Document 1 (inherits ADMIN from Folder A)
       └── Document 2 (inherits ADMIN from Folder A)
  └── Folder B (READ permission granted explicitly to Alice)
       └── Document 3 (inherits READ from Folder B)
```

In this example:

- Alice has ADMIN on the Drive, so she inherits ADMIN on Folder A and its documents
- Alice was explicitly granted READ on Folder B, so Document 3 only has READ access
- Without explicitly setting permissions on Folder B, all folders would inherit ADMIN from the Drive

### Database Schema

The Reactor API stores permission data in a relational database using six tables:

| Table                      | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `DocumentPermission`       | Direct user-document permissions (e.g., "Alice has WRITE on Document X")   |
| `Group`                    | Group definitions (e.g., "Engineering Team")                               |
| `UserGroup`                | User-group memberships (e.g., "Alice is in Engineering Team")              |
| `DocumentGroupPermission`  | Group-document permissions (e.g., "Engineering Team has READ on Drive Y")  |
| `OperationUserPermission`  | User-operation permissions (e.g., "Bob can execute DELETE_NODE")           |
| `OperationGroupPermission` | Group-operation permissions (e.g., "Admins group can execute DELETE_NODE") |

:::info
These tables are automatically created by database migrations when you enable `DOCUMENT_PERMISSIONS_ENABLED=true`. You don't need to create them manually.
:::

## GraphQL API

The Reactor API exposes a GraphQL interface for all operations. When `DOCUMENT_PERMISSIONS_ENABLED=true`, an **Auth subgraph** is registered that adds permission-related queries and mutations to the API.

:::tip How to use these APIs
All GraphQL operations below require:

1. A valid bearer token from `ph access-token`
2. The token included in the `Authorization` header followed by 'Bearer &lt;token&gt;'
3. The Reactor API running with both `AUTH_ENABLED=true` and `DOCUMENT_PERMISSIONS_ENABLED=true` as variables
   :::

### Queries

Queries allow you to read permission information without modifying it.

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

## Configuration

You can configure the Reactor API using either environment variables or a `powerhouse.config.json` file. Environment variables take precedence over the config file.

### Environment Variables

```bash
# Enable authentication (required for document permissions)
AUTH_ENABLED=true

# Enable document permissions feature (requires AUTH_ENABLED=true)
DOCUMENT_PERMISSIONS_ENABLED=true

# Global admin addresses (bypass all permission checks)
# These users are Reactor-wide administrators
ADMINS="0x123...,0x456..."

# Global user addresses (basic access to the Reactor)
# These users can access the Reactor but still need document permissions
USERS="0x789...,0xabc..."

# Global guest addresses (limited read-only access)
GUESTS="0xdef...,0xghi..."

# Allow any authenticated user (free entry mode)
# When true, any user with a valid Renown credential can access the Reactor
FREE_ENTRY=true
```

### powerhouse.config.json

Alternatively, configure authorization in your `powerhouse.config.json` file:

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

:::info Two Layers of Authorization

- **[Global roles](./04-Authorization.md)** (`ADMINS`, `USERS`, `GUESTS`): Control who can access the Reactor API at all
- **Document permissions** (this guide): Control who can access specific documents within the Reactor

Both layers work together. A user must pass the [global role check](./04-Authorization.md) before document permissions are evaluated.

**Reminder:** When `FREE_ENTRY=true` is enabled, the global role check allows any authenticated user to access the Reactor, simplifying the authorization flow for open environments.
:::

## Usage Examples: Setting up a 'Secret Society' group

This section provides practical examples for common permission management scenarios. These examples assume you have:

- A running Reactor API with `AUTH_ENABLED=true` and `DOCUMENT_PERMISSIONS_ENABLED=true`
- A valid bearer token from `ph access-token`
- The Ethereum address of users you want to grant permissions to

<details>
<summary><strong>Complete Scenario: Secret Society Document Permissions</strong></summary>

This walkthrough demonstrates creating a private group with specific document and operation permissions. We'll create a "Secret Society" group, add members, create a private drive, and configure granular permissions.

### Step 1: Start the Reactor with Authentication

We have 3 options to configure authorization rules:

- Environment variables
- `powerhouse.config.json` file
- CLI command during local development

For this example, we'll use the CLI approach:

```bash
AUTH_ENABLED=true DOCUMENT_PERMISSIONS_ENABLED=true ADMINS=0x1234...abcd ph switchboard
```

**Expected CLI output:**

```
[switchboard] [connect-crypto] Switchboard identity initialized: did:key:zDnaepECmgs6RCDdjVo2RTYyPxoW5ZC4hN4iHrHH9Su9cXdM1
[reactor-api] [server] Setting up Auth middleware
[reactor-api] [server] Document permission migrations completed
[reactor-api] [server] Document permission service initialized
```

✅ Authorization and document permissions have been initialized successfully.

### Step 2: Authenticate and Get Access Token

Now authenticate and generate a bearer token for API requests:

```bash
# Authenticate with your admin wallet
ph login

# Generate access token (valid for 7 days)
ph access-token --expiry 7d
```

Copy the access token and include it in your GraphQL requests as: `Authorization: Bearer <your-token>`

### Step 3: Create the Secret Society Group

**Mutation:**

```graphql
mutation CreateGroup($name: String!) {
  createGroup(name: $name) {
    name
    id
  }
}
```

**Variables:**

```json
{
  "name": "secret-society"
}
```

**Expected Result:**

```json
{
  "data": {
    "createGroup": {
      "name": "secret-society",
      "id": 1
    }
  }
}
```

### Step 4: Add Members to the Group

**Add Member 1:**

**Mutation:**

```graphql
mutation AddUserToGroup($userAddress: String!, $groupId: Int!) {
  addUserToGroup(userAddress: $userAddress, groupId: $groupId)
}
```

**Variables:**

```json
{
  "userAddress": "0xabcd...1234",
  "groupId": 1
}
```

**Expected Result:**

```json
{
  "data": {
    "addUserToGroup": true
  }
}
```

**Add Member 2:**

Use the same mutation with different variables:

**Variables:**

```json
{
  "userAddress": "0xefgh...5678",
  "groupId": 1
}
```

### Step 5: Create a Private Drive

**Mutation:**

```graphql
mutation AddDrive($name: String!, $addDriveId: String, $slug: String) {
  addDrive(name: $name, id: $addDriveId, slug: $slug) {
    id
    name
    slug
  }
}
```

**Variables:**

```json
{
  "name": "secret-drive",
  "addDriveId": null,
  "slug": null
}
```

**Expected Result:**

```json
{
  "data": {
    "addDrive": {
      "id": "drive-uuid-1234-5678-abcd",
      "name": "secret-drive",
      "slug": "secret-drive"
    }
  }
}
```

📝 **Note:** Copy the returned `id` for the next steps.

### Step 6: Grant Group Write Access to the Drive

**Mutation:**

```graphql
mutation GrantGroupPermission(
  $documentId: String!
  $groupId: Int!
  $permission: DocumentPermissionLevel!
) {
  grantGroupPermission(
    documentId: $documentId
    groupId: $groupId
    permission: $permission
  ) {
    groupId
    grantedBy
    documentId
    group {
      name
    }
  }
}
```

**Variables:**

```json
{
  "documentId": "drive-uuid-1234-5678-abcd",
  "groupId": 1,
  "permission": "WRITE"
}
```

**Expected Result:**

```json
{
  "data": {
    "grantGroupPermission": {
      "groupId": 1,
      "grantedBy": "0x1234...abcd",
      "documentId": "drive-uuid-1234-5678-abcd",
      "group": {
        "name": "secret-society"
      }
    }
  }
}
```

### Step 7: Grant Specific Operation Permission

Give Member 1 permission to execute the `AddFile` operation:

**Mutation:**

```graphql
mutation GrantOperationPermission(
  $documentId: String!
  $operationType: String!
  $userAddress: String!
) {
  grantOperationPermission(
    documentId: $documentId
    operationType: $operationType
    userAddress: $userAddress
  ) {
    operationType
    userAddress
    documentId
  }
}
```

**Variables:**

```json
{
  "documentId": "drive-uuid-1234-5678-abcd",
  "operationType": "AddFile",
  "userAddress": "0xBE51A2dcE154DC78Ce73704b37E1C270C06952AC"
}
```

**Expected Result:**

```json
{
  "data": {
    "grantOperationPermission": {
      "operationType": "AddFile",
      "userAddress": "0xabcd...1234",
      "documentId": "2d707e84-309a-4b69-803a-400786806ebf"
    }
  }
}
```

### Step 8: Test Permission Enforcement

Now let's test our permission setup by switching between different user accounts.

#### Test 1: Member 2 tries to create a file (should fail)

First, logout and login as Member 2:

```bash
ph login --logout
ph login  # Login with Member 2's wallet (0xefgh...5678)
ph access-token --expiry 7d
```

**Mutation:**

```graphql
mutation TodoList_createDocument($name: String!) {
  TodoList_createDocument(name: $name)
}
```

**Variables:**

```json
{
  "name": "Secret society todos"
}
```

**Expected Result:** ❌ **Permission Denied**

```json
{
  "errors": [
    {
      "message": "Insufficient permissions to execute AddFile operation"
    }
  ]
}
```

#### Test 2: Member 1 creates a file (should succeed)

Logout and login as Member 1:

```bash
ph login --logout
ph login  # Login with Member 1's wallet (0xabcd...1234)
ph access-token --expiry 7d
```

**Mutation:**

```graphql
mutation TodoList_createDocument($name: String!) {
  TodoList_createDocument(name: $name)
}
```

**Variables:**

```json
{
  "name": "Secret society todos"
}
```

**Expected Result:** ✅ **Success**

```json
{
  "data": {
    "TodoList_createDocument": "document-uuid-abcd-1234-efgh"
  }
}
```

#### Test 3: Member 2 renames the file (should succeed)

Switch back to Member 2:

```bash
ph login --logout
ph login  # Login with Member 2's wallet
ph access-token --expiry 7d
```

**Mutation:**

```graphql
mutation RenameDocument($documentIdentifier: String!, $name: String!) {
  renameDocument(documentIdentifier: $documentIdentifier, name: $name) {
    name
    parentId
    id
  }
}
```

**Variables:**

```json
{
  "documentIdentifier": "document-uuid-abcd-1234-efgh",
  "name": "Not-so-secret-todos"
}
```

**Expected Result:** ✅ **Success**

```json
{
  "data": {
    "renameDocument": {
      "name": "Not-so-secret-todos",
      "parentId": "drive-uuid-1234-5678-abcd",
      "id": "document-uuid-abcd-1234-efgh"
    }
  }
}
```

### Summary

This scenario demonstrates:

1. **Group-based permissions**: Both members have WRITE access to the drive through group membership
2. **Operation-level permissions**: Only Member 1 can create new files (`AddFile` operation)
3. **Permission inheritance**: Once a file exists, all group members can perform other operations (like renaming) due to their WRITE permissions on the parent drive
4. **Granular control**: You can restrict specific operations while allowing broader document access

</details>

## Integration with Auth Flow

The document permission system integrates with the **Renown authentication flow**. Renown provides decentralized identity using Ethereum addresses and DIDs (Decentralized Identifiers).

### Authentication Flow

1. **User authenticates via `ph login`**: The user connects their Ethereum wallet and creates/retrieves a DID
2. **User generates a bearer token via `ph access-token`**: A JWT token is created that includes the user's Ethereum address
3. **Bearer token is included in API requests**: The client includes the token in the `Authorization` header
4. **Reactor API verifies the token**: The API validates the JWT and extracts the user's Ethereum address
5. **Permission checks are performed**: The system uses the Ethereum address to look up document permissions

### Example: Making Authenticated Requests

```bash
# Generate access token (valid for 7 days)
TOKEN="$(ph access-token --expiry 7d)"

# Make authenticated request to query your permissions
curl -X POST http://localhost:4001/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"query": "{ userDocumentPermissions { documentId permission } }"}'
```

:::tip User Identification
Permissions are tied to **Ethereum addresses** (e.g., `0x123...`), not usernames. When granting permissions, use the user's Ethereum address as shown in their Renown profile or obtained from `ph login --status`.
:::

## Best Practices

1. **Use groups for team access**: Instead of granting individual permissions, create groups and assign permissions to groups

2. **Grant ADMIN sparingly**: Only grant ADMIN permission to users who need to manage permissions

3. **Use permission inheritance**: Grant permissions at the drive or folder level, let them inherit down

4. **Document your permission structure**: Keep track of which groups have access to which drives

5. **Regular audits**: Periodically review permissions and remove stale access

## Troubleshooting

Common issues and how to resolve them:

### Permission denied errors

If a user receives "Permission denied" when trying to access a document:

1. Verify `AUTH_ENABLED=true` and `DOCUMENT_PERMISSIONS_ENABLED=true` in your Reactor configuration
2. Check that the user has a valid Renown credential (`ph login --status`)
3. Verify the bearer token is valid and not expired (`ph access-token` to generate a new one)
4. Check if the user has direct or group permission on the document using `documentAccess` query
5. Check if permission is inherited from a parent document (drive or folder)

### Migrations not running

Ensure database migrations have run:

```bash
# Migrations run automatically on startup when DOCUMENT_PERMISSIONS_ENABLED=true
# Check logs for "Document permission migrations completed"
```
