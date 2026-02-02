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

<details>
<summary><strong>Useful Queries</strong></summary>

#### Get document access info

```graphql
query GetDocumentAccess($documentId: String!) {
  documentAccess(documentId: $documentId) {
    documentId
    groupPermissions {
      documentId
      groupId
      group {
        id
        name
        description
        members
      }
      permission
      grantedBy
    }
    permissions {
      documentId
      userAddress
      permission
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

#### Get group by ID

```graphql
query GetGroup($id: Int!) {
  group(id: $id) {
    id
    name
    description
    members
    createdAt
    updatedAt
  }
}
```

#### Get user groups

```graphql
query GetUserGroups($userAddress: String!) {
  userGroups(userAddress: $userAddress) {
    id
    name
    description
    members
  }
}
```

#### Get operation permissions

```graphql
query GetOperationPermissions($documentId: String!, $operationType: String!) {
  operationPermissions(documentId: $documentId, operationType: $operationType) {
    documentId
    operationType
    userPermissions {
      documentId
      operationType
      userAddress
      grantedBy
      createdAt
    }
    groupPermissions {
      documentId
      operationType
      groupId
      group {
        id
        name
      }
      grantedBy
      createdAt
    }
  }
}
```

#### Document Drive Operation Types

For document drives specifically, the following operation permissions are available:

- `ADD_FILE` - Create new files within the drive
- `ADD_FOLDER` - Create new folders within the drive
- `DELETE_NODE` - Delete files or folders within the drive
- `UPDATE_FILE` - Modify existing files within the drive
- `UPDATE_NODE` - Update properties of files or folders within the drive (including renaming documents)
- `COPY_NODE` - Copy files or folders within the drive
- `MOVE_NODE` - Move files or folders within the drive

:::info Operation Permissions vs Document Permissions
These operation permissions provide fine-grained control over specific actions within a document drive, separate from the general document permission levels (READ, WRITE, ADMIN). Note that renaming a document is not part of the WRITE permission on the document itself—it's an `UPDATE_NODE` operation on the drive document. If you need to set operation permissions for documents with different document models, familiarize yourself with the available operations of the installed document model package.
:::

</details>

<details>
<summary><strong>Useful Mutations</strong></summary>

### Document Permissions

#### Grant document permission to user

```graphql
mutation GrantDocumentPermission(
  $documentId: String!
  $userAddress: String!
  $permission: DocumentPermissionLevel!
) {
  grantDocumentPermission(
    documentId: $documentId
    userAddress: $userAddress
    permission: $permission
  ) {
    documentId
    userAddress
    permission
    grantedBy
    createdAt
    updatedAt
  }
}
```

#### Revoke document permission from user

```graphql
mutation RevokeDocumentPermission($documentId: String!, $userAddress: String!) {
  revokeDocumentPermission(documentId: $documentId, userAddress: $userAddress)
}
```

### Group Management

#### Create group

```graphql
mutation CreateGroup($name: String!, $description: String) {
  createGroup(name: $name, description: $description) {
    id
    name
    description
    createdAt
    updatedAt
    members
  }
}
```

#### Delete group

```graphql
mutation DeleteGroup($id: Int!) {
  deleteGroup(id: $id)
}
```

#### Add user to group

```graphql
mutation AddUserToGroup($userAddress: String!, $groupId: Int!) {
  addUserToGroup(userAddress: $userAddress, groupId: $groupId)
}
```

#### Remove user from group

```graphql
mutation RemoveUserFromGroup($userAddress: String!, $groupId: Int!) {
  removeUserFromGroup(userAddress: $userAddress, groupId: $groupId)
}
```

### Group Permissions

#### Grant group permission

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
    documentId
    groupId
    group {
      id
      name
    }
    permission
    grantedBy
    createdAt
    updatedAt
  }
}
```

#### Revoke group permission

```graphql
mutation RevokeGroupPermission($documentId: String!, $groupId: Int!) {
  revokeGroupPermission(documentId: $documentId, groupId: $groupId)
}
```

### Operation Permissions

#### Grant operation permission to user

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
    documentId
    operationType
    userAddress
    grantedBy
    createdAt
  }
}
```

#### Revoke operation permission from user

```graphql
mutation RevokeOperationPermission(
  $documentId: String!
  $operationType: String!
  $userAddress: String!
) {
  revokeOperationPermission(
    documentId: $documentId
    operationType: $operationType
    userAddress: $userAddress
  )
}
```

#### Grant group operation permission

```graphql
mutation GrantGroupOperationPermission(
  $documentId: String!
  $operationType: String!
  $groupId: Int!
) {
  grantGroupOperationPermission(
    documentId: $documentId
    operationType: $operationType
    groupId: $groupId
  ) {
    documentId
    operationType
    groupId
    group {
      id
      name
    }
    grantedBy
    createdAt
  }
}
```

#### Revoke group operation permission

```graphql
mutation RevokeGroupOperationPermission(
  $documentId: String!
  $operationType: String!
  $groupId: Int!
) {
  revokeGroupOperationPermission(
    documentId: $documentId
    operationType: $operationType
    groupId: $groupId
  )
}
```

<details>
<summary><strong>Document Management</strong></summary>

#### Create document

```graphql
mutation CreateDocument($document: JSONObject!, $parentIdentifier: String) {
  createDocument(document: $document, parentIdentifier: $parentIdentifier) {
    id
    name
    documentType
    state
    createdAtUtcIso
    lastModifiedAtUtcIso
    parentId
  }
}
```

#### Create empty document

```graphql
mutation CreateEmptyDocument(
  $documentType: String!
  $parentIdentifier: String
) {
  createEmptyDocument(
    documentType: $documentType
    parentIdentifier: $parentIdentifier
  ) {
    id
    name
    documentType
    state
    createdAtUtcIso
    lastModifiedAtUtcIso
    parentId
  }
}
```

#### Mutate document

```graphql
mutation MutateDocument(
  $documentIdentifier: String!
  $actions: [JSONObject!]!
  $view: ViewFilterInput
) {
  mutateDocument(
    documentIdentifier: $documentIdentifier
    actions: $actions
    view: $view
  ) {
    id
    name
    documentType
    state
    revisionsList {
      scope
      revision
    }
    lastModifiedAtUtcIso
  }
}
```

#### Rename document

```graphql
mutation RenameDocument(
  $documentIdentifier: String!
  $name: String!
  $branch: String
) {
  renameDocument(
    documentIdentifier: $documentIdentifier
    name: $name
    branch: $branch
  ) {
    id
    name
    documentType
    lastModifiedAtUtcIso
    parentId
  }
}
```

#### Delete document

```graphql
mutation DeleteDocument($identifier: String!, $propagate: PropagationMode) {
  deleteDocument(identifier: $identifier, propagate: $propagate)
}
```

</details>

<details>
<summary><strong>Drive Management</strong></summary>

#### Add drive

```graphql
mutation AddDrive(
  $name: String!
  $icon: String
  $id: String
  $slug: String
  $preferredEditor: String
) {
  addDrive(
    name: $name
    icon: $icon
    id: $id
    slug: $slug
    preferredEditor: $preferredEditor
  ) {
    id
    slug
    name
    icon
    preferredEditor
  }
}
```

#### Delete drive

```graphql
mutation DeleteDrive($id: String!) {
  deleteDrive(id: $id)
}
```

#### Set drive icon

```graphql
mutation SetDriveIcon($id: String!, $icon: String!) {
  setDriveIcon(id: $id, icon: $icon)
}
```

#### Set drive name

```graphql
mutation SetDriveName($id: String!, $name: String!) {
  setDriveName(id: $id, name: $name)
}
```

</details>

</details>

## GraphQL API

The Reactor API exposes a GraphQL interface for all operations. When `DOCUMENT_PERMISSIONS_ENABLED=true`, an **Auth subgraph** is registered that adds permission-related queries and mutations to the API.

:::tip How to use these APIs
All GraphQL operations below require:

1. A valid bearer token from `ph access-token`
2. The token included in the `Authorization` header followed by 'Bearer &lt;token&gt;'
3. The Reactor API running with both `AUTH_ENABLED=true` and `DOCUMENT_PERMISSIONS_ENABLED=true` as variables
   :::

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

## Usage Examples: Company Document Access & Permissions

This section provides practical examples for common permission management scenarios. These examples assume you have:

- A running Reactor API with `AUTH_ENABLED=true` and `DOCUMENT_PERMISSIONS_ENABLED=true`
- A valid bearer token from `ph access-token`
- The Ethereum address of users you want to grant permissions to

<details>
<summary><strong>Complete Scenario: Company Document Access & Permissions</strong></summary>

This walkthrough demonstrates setting up document access for a company with different departments and roles. We'll create a "Finance Team" group, add team members, create a confidential finance drive, and configure granular permissions for sensitive financial documents.

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

### Step 3: Create the Finance Team Group

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
  "name": "finance-team"
}
```

**Expected Result:**

```json
{
  "data": {
    "createGroup": {
      "name": "finance-team",
      "id": 1
    }
  }
}
```

### Step 4: Add Finance Team Members

**Add Finance Manager (Alice):**

**Mutation:**

```graphql
mutation AddUserToGroup($userAddress: String!, $groupId: Int!) {
  addUserToGroup(userAddress: $userAddress, groupId: $groupId)
}
```

**Variables:**

```json
{
  "userAddress": "0xalice...finance",
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

**Add Financial Analyst (Bob):**

Use the same mutation with different variables:

**Variables:**

```json
{
  "userAddress": "0xbob...analyst",
  "groupId": 1
}
```

### Step 5: Create a Finance Drive

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
  "name": "finance-documents",
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
      "name": "finance-documents",
      "slug": "finance-documents"
    }
  }
}
```

📝 **Note:** Copy the returned `id` for the next steps.

### Step 6: Grant Finance Team Write Access to the Drive

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
        "name": "finance-team"
      }
    }
  }
}
```

### Step 7: Grant Specific Operation Permission

Give Finance Manager permission to execute the `ADD_FILE` operation for creating new financial documents. See the [Document Drive Operation Types](#document-drive-operation-types) section for all available operation permissions:

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
  "operationType": "ADD_FILE",
  "userAddress": "0xalice...finance"
}
```

**Expected Result:**

```json
{
  "data": {
    "grantOperationPermission": {
      "operationType": "ADD_FILE",
      "userAddress": "0xalice...finance",
      "documentId": "2d707e84-309a-4b69-803a-400786806ebf"
    }
  }
}
```

### Step 8: Test Permission Enforcement

Now let's test our permission setup by switching between different user accounts.

#### Test 1: Financial Analyst tries to create a file (should fail)

First, logout and login as Bob (Financial Analyst):

```bash
ph login --logout
ph login  # Login with Bob's wallet (0xbob...analyst)
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
  "name": "Q1 Budget Planning"
}
```

**Expected Result:** ❌ **Permission Denied**

```json
{
  "errors": [
    {
      "message": "Forbidden: insufficient permissions to create documents"
    }
  ]
}
```

#### Test 2: Finance Manager creates a file (should succeed)

Logout and login as Alice (Finance Manager):

```bash
ph login --logout
ph login  # Login with Alice's wallet (0xalice...finance)
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
  "name": "Q1 Budget Planning"
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

#### Test 3: Financial Analyst renames the file (should succeed)

Switch back to Bob (Financial Analyst):

```bash
ph login --logout
ph login  # Login with Bob's wallet
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
  "name": "Q1 Budget Planning - Draft"
}
```

**Expected Result:** ✅ **Success**

```json
{
  "data": {
    "renameDocument": {
      "name": "Q1 Budget Planning - Draft",
      "parentId": "drive-uuid-1234-5678-abcd",
      "id": "document-uuid-abcd-1234-efgh"
    }
  }
}
```

### Summary

This scenario demonstrates:

1. **Group-based permissions**: Both finance team members have WRITE access to the finance drive through group membership
2. **Operation-level permissions**: Only the Finance Manager can create new financial documents (`AddFile` operation)
3. **Permission inheritance**: Once a document exists, all team members can perform other operations (like renaming) due to their WRITE permissions on the parent drive
4. **Granular control**: You can restrict specific operations while allowing broader document access, perfect for sensitive financial data

</details>

<details>
<summary><strong>Advanced Scenario: Todo List Collaboration</strong></summary>

This scenario demonstrates advanced authorization patterns for managing contributor access levels to a shared todo list document, focusing on role-based access control and operation-level permissions using the @powerhousedao/todo-demo package. To get access to this subgraph yourself make sure to install the package in your project with `ph install @powerhousedao/todo-demo`

<details>
<summary><strong>Todo Document Schema Reference</strong></summary>

```graphql
type TodoList implements IDocument {
  id: String!
  name: String!
  documentType: String!
  operations(skip: Int, first: Int): [Operation!]!
  revision: Int!
  createdAtUtcIso: DateTime!
  lastModifiedAtUtcIso: DateTime!
  initialState: TodoList_TodoListState!
  state: TodoList_TodoListState!
  stateJSON: JSONObject
}

"""
Module: Todos
"""
input TodoList_AddTodoItemInput {
  text: String!
}

input TodoList_DeleteTodoItemInput {
  id: OID!
}

type TodoList_TodoItem {
  id: OID!
  text: String!
  checked: Boolean!
}

type TodoList_TodoListState {
  items: [TodoList_TodoItem!]!
}

input TodoList_UpdateTodoItemInput {
  id: OID!
  text: String
  checked: Boolean
}

"""
Queries: TodoList Document
"""
type TodoListQueries {
  getDocument(docId: PHID!, driveId: PHID): TodoList
  getDocuments(driveId: String!): [TodoList!]
}
```

</details>

### The Setup

- **Project Lead** (Alice): Full admin control
- **Core Contributors** (Bob, Carol): Can add and update todo items
- **External Contributors** (Dave, Eve): Read-only access, can only add new todo items
- **Team Leads** (Frank): Special access to delete todo items only

### Step 1: Create Role-Based Groups

**Create role-based groups:**

```graphql
mutation CreateCoreGroup {
  createGroup(
    name: "core-contributors"
    description: "Team members who can add and update todo items"
  ) {
    id
    name
  }
}
```

```graphql
mutation CreateExternalGroup {
  createGroup(
    name: "external-contributors"
    description: "External users who can only add new todo items"
  ) {
    id
    name
  }
}
```

```graphql
mutation CreateLeadsGroup {
  createGroup(
    name: "team-leads"
    description: "Team leads who can delete todo items"
  ) {
    id
    name
  }
}
```

### Step 2: Assign Users to Groups

**Add core team members:**

```graphql
mutation AddBobToCore {
  addUserToGroup(userAddress: "0xbob...core", groupId: 1)
}
```

```graphql
mutation AddCarolToCore {
  addUserToGroup(userAddress: "0xcarol...core", groupId: 1)
}
```

**Add external contributors:**

```graphql
mutation AddDaveToExternal {
  addUserToGroup(userAddress: "0xdave...external", groupId: 2)
}
```

**Add team lead:**

```graphql
mutation AddFrankToLeads {
  addUserToGroup(userAddress: "0xfrank...lead", groupId: 3)
}
```

### Step 3: Set Document-Level Permissions

**Grant different access levels to each group for the todo list document:**

```graphql
mutation GrantCoreWriteAccess {
  grantGroupPermission(
    documentId: "todo-document-id"
    groupId: 1
    permission: WRITE
  ) {
    groupId
    permission
    group {
      name
    }
  }
}
```

```graphql
mutation GrantExternalReadAccess {
  grantGroupPermission(
    documentId: "todo-document-id"
    groupId: 2
    permission: READ
  ) {
    groupId
    permission
    group {
      name
    }
  }
}
```

```graphql
mutation GrantLeadsReadAccess {
  grantGroupPermission(
    documentId: "todo-document-id"
    groupId: 3
    permission: READ
  ) {
    groupId
    permission
    group {
      name
    }
  }
}
```

### Step 4: Operation-Level Permission Control

**External contributors can only add new todo items:**

```graphql
mutation AllowExternalAddTodo {
  grantGroupOperationPermission(
    documentId: "todo-document-id"
    operationType: "AddTodoItem"
    groupId: 2
  ) {
    operationType
    group {
      name
    }
  }
}
```

**Only core contributors can update todo items:**

```graphql
mutation AllowCoreUpdateTodo {
  grantGroupOperationPermission(
    documentId: "todo-document-id"
    operationType: "UpdateTodoItem"
    groupId: 1
  ) {
    operationType
    group {
      name
    }
  }
}
```

**Only team leads can delete todo items:**

```graphql
mutation AllowLeadsDeletion {
  grantGroupOperationPermission(
    documentId: "todo-document-id"
    operationType: "DeleteTodoItem"
    groupId: 3
  ) {
    operationType
    group {
      name
    }
  }
}
```

### Step 5: Permission Auditing & Verification

**Check what permissions a user has:**

```graphql
query MyPermissions {
  userDocumentPermissions {
    documentId
    permission
    grantedBy
    createdAt
  }
}
```

**Audit all access to sensitive document:**

```graphql
query AuditDocumentAccess($docId: String!) {
  documentAccess(documentId: $docId) {
    permissions {
      userAddress
      permission
      grantedBy
    }
    groupPermissions {
      group {
        name
        members
      }
      permission
      grantedBy
    }
  }
}
```

**Verify if user can perform specific operation:**

```graphql
query CheckOperationAccess($docId: String!, $operation: String!) {
  canExecuteOperation(documentId: $docId, operationType: $operation)
}
```

### Step 7: Dynamic Permission Management

**Promote external contributor to core team:**

```graphql
mutation PromoteContributor($userAddress: String!) {
  removeUserFromGroup(userAddress: $userAddress, groupId: 2)
}
```

```graphql
mutation AddToCore($userAddress: String!) {
  addUserToGroup(userAddress: $userAddress, groupId: 1)
}
```

**Remove user from all groups (suspend access):**

```graphql
mutation SuspendUser($userAddress: String!) {
  removeUserFromGroup(userAddress: $userAddress, groupId: 1)
}
```

### Authorization Patterns Demonstrated

1. **Role-Based Access Control (RBAC)**: Groups represent roles with different permission levels
2. **Document-Level Permissions**: Fine-grained control over specific document access
3. **Operation-Level Granularity**: Fine-grained control over specific todo list operations (add vs. update vs. delete)
4. **Individual Overrides**: User-specific permissions that supersede group permissions
5. **Audit Trail**: Complete visibility into who granted what permissions when
6. **Dynamic Role Management**: Users can be promoted/demoted between roles
7. **Principle of Least Privilege**: Each role gets minimum necessary permissions

This scenario showcases how to implement granular permission control for collaborative document editing using specific document model operations from installed packages like @powerhousedao/todo-demo.

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
