# Release Changelog

## 🚀 **v6.0.0**

### MIGRATION STEPS

- Minimum supported NodeJS version is now 24.

## 🚀 **v5.3.0**

### ✨ Highlights

1. **Authentication & Permissions** - CLI authentication and document-level permission system on Switchboard
2. **Improved code generation with TS Morph and templates** - Faster, more reliable code generation and templates are easier to maintain
3. **Runtime Document Model Subgraphs** - No more generated subgraph code to manage

### NEW FEATURES

#### 🔐 CLI Authentication

New CLI commands for authentication workflows:

**`ph login`** - Authenticate with your Powerhouse identity

```bash
ph login
```

**`ph access-token`** - Generate access tokens for API authentication

```bash
ph access-token
```

#### 🛡️ Document Permission Service

A new permission system that provides fine-grained access control at the document level for Switchboard

**Key Features:**

- **Operation Permissions** - Control who can perform specific operations on documents
- **Document Group Permissions** - Organize documents into groups with shared access rules
- **Feature Flag** - Enable/disable via configuration

The permission service can be enabled via environment variable or configuration. When enabled, all document operations are validated against the permission rules.

#### Runtime Document Model Subgraphs

Document model subgraphs are now automatically available on Switchboard at runtime.
**Action required:** Previously generated subgraphs should be deleted to avoid conflicts.

#### React Hooks Changes

**Bug Fixes**

- _Bug fix_: Hooks that return multiple documents now correctly update when any of the documents changes
- Improved React Suspense integration to avoid triggering loading states on every document update

**Imperative document hooks**

Added `useGetDocument` and `useGetDocuments` hooks to allow fetching documents imperatively.

```typescript
const getDocument = useGetDocument();

const onDocumentSelected = async (id: string) => {
  // Document is only fetched when the callback is invoked
  const document = await getDocument(id);
};
```

**Handle result of dispatched actions**

The `dispatch` function now accepts two optional callbacks:

- `onErrors` - invoked with any errors thrown by the reducers when processing the actions.
- `onSuccess` - invoked with the updated document.

These callbacks are useful to update the UI or perform other actions based on the result of the dispatched action.

**Usage:**

```typescript
const [document, dispatch] = useDocumentById(documentId);

dispatch(
  myAction,
  // Handle errors (e.g., show toast notification)
  (errors) => {
    alert(errors);
  },
  // Handle success
  (document) => {
    console.log("Document updated:", document);
  },
);
```

### MIGRATION STEPS

#### ph migrate

Run `ph migrate` to automatically apply some necessary migrations to your project.

#### Editor Style Updates

The padding added by Connect when displaying the editor has been removed. Each editor is now able to control its own padding.

#### Delete document model subgraphs

Delete the document model subgraphs from your project to avoid conflicts with the automatically generated subgraphs.

#### vitest.config.ts Configuration Update

For existing projects generated before this release, update your project configuration files to exclude `vitest.config.ts` from TypeScript compilation and add it to ESLint's allowed project list:

**In `tsconfig.json`:**

```json
{
  "exclude": ["node_modules", "dist", "eslint.config.js", "vitest.config.ts"]
}
```

**In `eslint.config.js`:**

```javascript
{
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ["eslint.config.js", "vitest.config.ts"];
      }
    }
  }
}
```

This prevents issues with `package.json` imports in vitest.config.ts being copied to the dist folder during compilation.

### BUG FIXES AND IMPROVEMENTS

#### Connect UI/UX

- Renaming a file now also updates the document name
- Fixed scroll overflow issues in files list
- Better default styling for editors and codegen templates
- Enhanced drive header with info menu, share menu, and Vetra Academy links

#### Document Export

- Fixed document extension handling when exporting documents
- Improved document response naming consistency
- Better error handling in export functionality

#### Document Editor Boilerplate

- The document editor boilerplate has been updated to provide a better starting point for custom editors.

### DOCUMENTATION (Now also live on https://academy.vetra.io)

**Authorization & Permissions:**

- [Reactor API Authorization](https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/Authorization/Authorization) - Role-based access control configuration
- [Document Permission System](https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/Authorization/DocumentPermissions) - Fine-grained document-level permissions

**Connect Tools:**

- [Inspector Modal](https://staging.powerhouse.academy/academy/MasteryTrack/ConnectTools/InspectorModal) - Database & reactor explorer

**Other Updates:**

- Updated hooks documentation
- Vetra Studio usage guides

### **Document Model Subgraphs**

Document model subgraphs are now available automatically on Switchboard. You should delete the generated subgraphs from your project to avoid conflicts.

## 🚀 **v5.1.0**

### ✨ Highlights

1. **Inspector Tools** - New debugging tools for database and sync operations
2. **Renown Login Component** - Improved authentication UI
3. **Sync Architecture** - New reactor client with GraphQL sync channels (WIP 🚧)
4. **Cryptographic Signing (Preview)** - Document and operation signing capabilities (WIP 🚧)

### NEW FEATURES

#### 🔍 Inspector Tools

New debugging components inside Connect to help developers understand what's happening under the hood of the reactor:

- **DB Explorer** - Browse and inspect tables in the local PGlite database
- **Remotes Inspector** - View configured sync remotes and their status
- **Channel Inspector** - Debug sync channels of the reactor (inbox, outbox, dead letter queues)

These tools can be enabled via feature flags. See the [Inspector Modal documentation](https://staging.powerhouse.academy/academy/MasteryTrack/ConnectTools/InspectorModal) for details.

#### 🔐 Renown Login Component

Improved authentication UI component with:

- Better user experience for wallet-based authentication
- Playwright end-to-end tests for reliability
- ConnectCrypto and Renown ID now available in hooks

#### 🔄 Sync Architecture Improvements

Major improvements to the synchronization system. We are staging big changes ahead of migrating to the new reactor architecture.

- **Reactor Client** - New client for Connect-to-Switchboard sync
- **GraphQL Channels** - Push/pull channels for bidirectional sync
- **WebSocket Subscriptions** - Real-time updates via GraphQL subscriptions
- **Conflict Resolution** - Improved handling of concurrent modifications

#### ✍️ Cryptographic Signing (Preview)

Initial support for document and operation signing:

- Connect crypto signer and verifier
- Document creation signatures
- All actions can now be signed

> **Note:** This feature is in preview and the API may change in future releases.

### IMPROVEMENTS

- **Healthcheck Routes** - Added `/health` endpoint for Connect and Switchboard for deployment monitoring
- **Feature Flags System** - Global context for managing feature flags across hooks
- **Logging Interface** - Improved debugging output
- **Docker Workflow** - Added docker build and publish workflow for Academy

### BUG FIXES

- Fixed Safari drag-and-drop with empty dataTransfer.items
- Fixed circular imports across multiple packages
- Improved HMR (Hot Module Replacement) for external packages
- Fixed document storage with better id/slug resolution

### DOCUMENTATION

- Updated Todo List tutorial with diff-based approach
- New Vetra commands documentation
- Reactor MCP documentation updates

---

## 🚀 **v5.0.0**

✨ **Highlights**

This release introduces four major changes:

1. **Vetra Development Workflow** (`ph vetra`) - A complete development environment for building Powerhouse packages
2. **AI-Assisted Package Development** - Build document models interactively using Claude Code and Model Context Protocol (MCP)
3. **New React Hooks** - Simplified hooks for document editor development
4. **React 19 Upgrade** - Updated to React 19 with latest features and improvements

## NEW FEATURES

### **Vetra Development Workflow** (`ph vetra`)

A complete development environment for building Powerhouse packages with real-time collaboration and code generation.

**What is Vetra?**

Vetra provides an integrated development flow that combines:

- Local Switchboard server
- Connect Studio UI for visual editing
- Real-time document synchronization
- Automatic code generation for document models, editors, processors and subgraphs
- Support for remote Vetra drives

**Key Features:**

- Start a complete development environment with one command: `ph vetra`
- Hot reload for document models and editors during development (`--watch`)
- Interactive code generation mode (`--interactive`)
- Connect to remote drives for collaborative development

**Getting Started:**

```bash
# Start Vetra with defaults
ph vetra

# Development mode with hot reload
ph vetra --watch

# Interactive code generation
ph vetra --interactive

# Connect to a remote drive
ph vetra --remote-drive https://switchboard.phd/d/vetra
```

### **AI-Assisted Package Development** (Model Context Protocol)

Build document models interactively using Claude Code through the Model Context Protocol (MCP) server.

**What is reactor-mcp?**

The reactor-mcp server exposes Powerhouse's document model system to AI assistants like Claude Code, enabling:

- Accessing and interacting with documents available on a Switchboard instance
- Interactive document model creation through conversation
- State schema design assistance
- Operation and reducer implementation
- Document editor UI implementation
- Real-time validation and feedback

**Available MCP Tools:**

Document Operations:

- `createDocument` - Create a new document
- `getDocument` - Retrieve a document by ID
- `getDocuments` - List documents in a drive
- `deleteDocument` - Delete a document
- `addActions` - Add actions to a document

Drive Operations:

- `getDrives` - List all drives
- `addDrive` - Create a new drive
- `getDrive` - Get a specific drive
- `deleteDrive` - Delete a drive
- `addRemoteDrive` - Connect to a remote drive

Document Model Operations:

- `getDocumentModels` - Get list of available document models
- `getDocumentModelSchema` - Get the schema of a specific document model

**Getting Started:**

1. Projects are generated with Claude Code pre-configured:

```bash
ph init
```

2. Start Vetra to start the MCP:

```bash
ph vetra
```

3. Ask Claude to help build your document model:

```
"Create a document model for tracking project milestones with completion status, deadlines, and dependencies"
```

4. Claude will guide you through:
   - Requirements gathering
   - State schema design
   - Operation definition
   - Reducer implementation
   - Code generation

**Workflow:**

1. Describe your requirements to Claude
2. Review and approve the proposed design
3. Claude creates the model using MCP tools
4. Code is generated automatically
5. Test and iterate in Vetra environment

## BREAKING CHANGES

### **New Hooks-Based State Management System**

The most significant change in v5.0.0 is the introduction of a comprehensive hooks-based state management system. This fundamentally changes how editors should be implemented.

**What Changed:**

- State management has been moved to reactor-browser hooks
- New hooks for accessing documents, drives, folders, and UI state
- Event-based updates replace direct state manipulation
- Simplified editor implementation patterns

**Impact on Editors:**

- Document and Drive editors need to adopt the new hook patterns from `@powerhousedao/reactor-browser`
- Navigation and selection state is now managed through hooks instead of props

**Learn More:** Complete hooks documentation and examples are available at https://staging.powerhouse.academy/academy/APIReferences/ReactHooks

**Migration Required:** Existing editors will need to be refactored to use the new hooks API. See Migration Guide below.

### **React 19 Upgrade**

This release upgrades to React 19, which includes breaking changes.

**What You Need to Know:**

- Review the official React 19 upgrade guide: https://react.dev/blog/2024/04/25/react-19-upgrade-guide
- Most React 18 code will continue to work, but deprecated patterns should be updated
- New React 19 features are now available

### **DocumentToolbar Component**

A new `DocumentToolbar` component is now available for editors to provide standard document operations UI. This replaces the previous config-based approach with a more flexible component-based implementation.

**What Changed:**

Previously, the document toolbar was configured using editor config parameters:

```typescript
// Old approach (v4.x)
{
  disableExternalControls: true,
  documentToolbarEnabled: true,
  showSwitchboardLink: true,
  timelineEnabled: true,
}
```

Now, you import and use the `DocumentToolbar` component directly in your editor:

```typescript
// New approach (v5.0)
import { DocumentToolbar } from "@powerhousedao/design-system";

<DocumentToolbar
  enabledControls={["undo", "redo", "export", "history"]}
/>
```

**Key Features:**

- **Flexible Control Configuration**: Choose which controls to display with `enabledControls` prop
- **Undo/Redo Operations**: Built-in support for document undo and redo
- **Export Functionality**: Document export with customizable handler
- **Revision History**: Access to document revision history
- **Switchboard Integration**: Automatic link generation for remote drives
- **Customizable Handlers**: Override default behaviors with custom callbacks

**Available Controls:**

- `undo` - Undo last operation
- `redo` - Redo last undone operation
- `export` - Export document
- `history` - Show revision history

**Migration Steps:**

1. Remove old config parameters from your editor configuration
2. Import `DocumentToolbar` from `@powerhousedao/design-system`
3. Add the component to your editor JSX with desired props
4. Customize behavior with optional callbacks (`onClose`, `onExport`, `onSwitchboardLinkClick`)

### **`ProcessorFactory` Signature Change**

The `ProcessorFactory` now takes a `PHDocumentHeader` instead of a `driveId`.

**Before (v4.x):**

```typescript
export type ProcessorFactory = (
  driveId: string,
) => ProcessorRecord[] | Promise<ProcessorRecord[]>;
```

**After (v5.0):**

```typescript
export type ProcessorFactory = (
  driveHeader: PHDocumentHeader,
) => ProcessorRecord[] | Promise<ProcessorRecord[]>;
```

**Migration Steps:**

1. Update your processor factories to take a `PHDocumentHeader` instead of a `driveId`
2. If necessary, regenerate your processor with `ph generate` to get the latest changes

### **Type Parameters Removed**

The `Action` type parameters have been removed, `Operation` type parameters have been removed, and the last `PHDocument` type parameter has been removed.

**Before (v4.x):**

```typescript
const action: Action<MyDocModelActionType, unknown> = {
  type: "my-action",
  input: {
    name: "John Doe",
  },
};
```

**After (v5.0):**

```typescript
const action: Action<unknown> = {
  type: "my-action",
  input: {
    name: "John Doe",
  },
};
```

### **`OperationScope` Removed**

Previously, an enum existed called `OperationScope` that was used to define the scope of an operation. This has been removed and replaced with a string type.

**Before (v4.x):**

```typescript
const operation: Operation = {
  scope: OperationScope.Global,
};
```

**After (v5.0):**

```typescript
const operation: Operation = {
  scope: "global",
};
```

### **`PHBaseState` Changes**

The `PHBaseState` type has a number of changes:

- It no longer has a type parameter
- `document` and `auth` scopes are now required

### **`Action` and `Operation` Changes**

The `Action` and `Operation` types have a number of changes:

- `Operation` no longer extends `Action`, it _has_ one
- Some fields have been renamed or removed

### **`ExtendedState` Removed**

This includes `createExtendedState`, `ExtendedStateFromDocument`, and `CreateExtendedState` functions.

## IMPROVEMENTS

### **Improved Connect Build System**

The `ph connect build` and `ph connect preview` commands have been completely reimplemented.

**Key improvements:**

- More reliable production builds
- Better handling of external packages
- Improved build performance
- Cleaner build output

### **Hot Module Replacement (HMR) for External Packages**

Development experience has been significantly improved with HMR support for external packages.

**What this means:**

- Changes to external document models and editors update instantly during development
- Faster iteration cycles when building custom packages
- No more full page reloads when editing external code

### **Relational Database Processors with Namespacing**

Operational processors now support namespace isolation per drive.

**Key features:**

- Each drive gets its own database namespace
- Prevents data conflicts between processors
- Better data organization and querying
- Schema generation with `ph generate schema` command

## MIGRATION GUIDE

This release includes several breaking changes. Here's what you need to update:

1. **Project Structure** - Significant changes require creating a new project or applying manual updates
2. **Document Models** - Must be regenerated with new templates
3. **Editors** - Must adopt new hooks-based API
4. **DocumentToolbar** - Config-based approach replaced with component
5. **ProcessorFactory** - Signature change requires updates
6. **Document Creation** - New pattern for creating documents
7. **Server Interface** - Simplified method signatures

### **Update your project**

There are significant breaking changes in the project structure. It is recommended to create a new project from scratch and migrate your code to it.
If you wish to migrate manually then follow these steps:

1. Update to the latest version with `ph update`
2. Apply these changes: https://github.com/powerhouse-inc/document-model-boilerplate/pull/42/files

### **Regenerate Document Models**

Run `ph generate` to regenerate your document models with updated templates.

**Note:**
It's still possible to generate from zip files, but due to breaking changes in the document structure, zips exported from older versions no longer work.
Instead: use `ph generate document-models/<yourdocument>/<yourdocument>.json`

### **Migrate editors to use the new hooks**

The new hooks-based state management system is the primary breaking change affecting editor implementations.
Editors no longer receive `document` and `dispatch` as props and must use the new hooks instead.

**Replace state access patterns on editors**

```typescript
// Before
function Editor(props) {
  const { document, dispatch } = props;
}

// After
function Editor() {
  const [document, dispatch] = useSelectedDocument();
}
```

### **React 19 Migration**

Refer to the official guide: https://react.dev/blog/2024/04/25/react-19-upgrade-guide

### **New Document Creation Pattern**

**Breaking Change**: Documents are no longer created using `ADD_FILE` operations. Instead, documents now exist independently and are created using the new `addDocument` method.

**Before (v4.x):**

```typescript
// Old pattern: Documents were created via ADD_FILE operations
await server.addDriveAction(driveId, {
  type: "ADD_FILE",
  input: {
    id: documentId,
    name: "My Document",
    documentType: "my-document-type",
    document: documentData,
    synchronizationUnits: [...]
  }
});
```

**After (v5.0):**

```typescript
// New pattern: Documents exist independently
await server.addDocument(document, meta);
// Then optionally add to drive if needed
await server.addAction(driveId, {
  type: "ADD_FILE",
  input: {
    id: documentId,
    name: "My Document",
    documentType: "my-document-type",
  },
});
```

**Key Changes:**

- **`addDocument`** - New method for creating documents
- `ADD_FILE` operation no longer takes the document state and synchronization units as input
- Documents can exist without being part of any drive
- Cleaner separation between document creation and drive organization

**Migration Steps:**

1. Update `ADD_FILE` operations and add `addDocument()` calls

### **IBaseDocumentDriveServer Interface Simplification**

The `IBaseDocumentDriveServer` interface has been simplified to remove the need for passing `driveId` parameters when interacting with documents. This change improves the API by removing redundant parameters and aligning with the new document-centric approach.

#### **Method Signature Changes**

The following methods have had their signatures simplified by removing the `driveId` parameter:

- `addOperation(driveId, documentId, operation, options)` → `addOperation(documentId, operation, options)`
- `addOperations(driveId, documentId, operations, options)` → `addOperations(documentId, operations, options)`
- `queueOperation(driveId, documentId, operation, options)` → `queueOperation(documentId, operation, options)`
- `queueOperations(driveId, documentId, operations, options)` → `queueOperations(documentId, operations, options)`
- `queueAction(driveId, documentId, action, options)` → `queueAction(documentId, action, options)`
- `queueActions(driveId, documentId, actions, options)` → `queueActions(documentId, actions, options)`
- `getDocument(driveId, documentId, options)` → `getDocument(documentId, options)`
- `addAction(driveId, documentId, action, options)` → `addAction(documentId, action, options)`
- `addActions(driveId, documentId, actions, options)` → `addActions(documentId, actions, options)`

#### **Migration Guide**

**Before (v4.x):**

```typescript
// Old method signatures requiring driveId
await server.addOperation(driveId, documentId, operation, options);
await server.queueActions(driveId, documentId, actions, options);
await server.getDocument(driveId, documentId, options);
```

**After (v5.0):**

```typescript
// New simplified method signatures
await server.addOperation(documentId, operation, options);
await server.queueActions(documentId, actions, options);
await server.getDocument(documentId, options);
```

#### **Backward Compatibility**

**Legacy support is maintained** - the old method signatures with `driveId` parameters are still supported but marked as `@deprecated`. They will be removed in a future release.

When using the old signatures, you'll see deprecation warnings guiding you to the new method signatures. This allows for gradual migration without breaking existing code.

**Migration Steps:**

1. Update your code to use the new method signatures without `driveId`
2. Test your application to ensure all functionality works correctly
3. Remove any unused `driveId` variables from your codebase

#### **Deprecated Drive-Specific Methods**

The following drive-specific methods are also deprecated in favor of the standard document methods:

- `addDriveOperation` → use `addOperation`
- `addDriveOperations` → use `addOperations`
- `queueDriveOperation` → use `queueOperation`
- `queueDriveOperations` → use `queueOperations`
- `queueDriveAction` → use `queueAction`
- `queueDriveActions` → use `queueActions`
- `addDriveAction` → use `addAction`
- `addDriveActions` → use `addActions`

## 🚀 **v4.0.0**

## BREAKING CHANGES

⚠️ For both the Dspot team & BAI team pull requests have been created that support with the breaking changes ⚠️

BAI team:[Contributor Billing Pull Request](https://github.com/powerhouse-inc/contributor-billing/pull/3)
Dspot Team: [Effective-Octo-Adventure](https://github.com/powerhouse-inc/effective-octo-adventure/pull/162)

### **Significant `PHDocument` refactor**

- Consolidating header information into the `header` field of the document. See the [PHDocument spec](./packages/reactor/docs/planning/PHDocument/index.md#header).
- Introducing signed and unsigned documents with Ed25519 keys . See the [PHDocument signing spec](./packages/reactor/docs/planning/PHDocument/signing.md).

### **Processor generator updates**

- The analytics processor template now includes a namespace and batch inserts by default.
- Analytics factories are now in their own files, allowing for multiple factories to be generated.

### Additional Migration Guide has been create to help you navigate the breaking change of other packages

- `PHDocument` changes:
  - **This version requires that document models be regenerated**. This means that you will need to run `ph generate` to regenerate the `gen` folder for document models.
  - Document metadata fields (like `id`, `slug`, `documentType`, `created`, `lastModified`, etc) have been moved to a `header` field of the document. Thus, `document.id` is now `document.header.id`.
  - `created` and `lastModified` have been renamed to `createdAtUtcIso` and `lastModifiedUtcIso` respectively.
- Processor generator updates:
  - A root processor factory is now generated in the `processors` folder. This will aggregate the collection of all processor factories. It is highly recommended to use this root factory to register all processors. Generating a new processor will put this root factory in place.

✨ **Highlights of this release**

New features for managing, querying, and analyzing information in real-time.
This release focuses on improving data accessibility, enhancing performance, and providing a foundation for advanced analytical insights.

Introducing the **Relational Database & Operational Processor System**, a new architecture designed to enhance data handling, querying, and synchronization across the host-apps.

### 2. Relational Database & Operational Processor System

**New Operational Processor Architecture with Namespacing**: This introduces a flexible and scalable way to process document operations and transform them into a relational database format. Namespacing ensures conflict avoidance and better organization of data.
**Database Schema Generation and Migration Support**: The system now automatically generates database schemas and supports migrations, simplifying database management and ensuring data consistency. It leverages Kysely for type-safe query construction.
**Enhanced Analytics Capabilities with Operational Queries**: By transforming document data into a relational store, we can now perform complex analytical queries that were previously challenging. This enables more robust reporting and data analysis.
**Processor Factory System and Root Processor Aggregation**: This provides a standardized way to create and manage different types of processors, including those for relational databases, and allows for efficient aggregation of processed data.

✅ **What to try:**

- Experiment with generating a new operational database processor using the `ph generate` command and specify different document types to see how the schema and files are created.
- Define a custom database schema and implement an `onStrands` method in your processor to index document states into the relational store.
- Run tests for your new processor, leveraging the in-memory PGlite instance, to validate the stored state with database queries.
- Generate a GraphQL subgraph to expose your processed data, then try running various GraphQL queries to access and filter your transformed data.

### 3. Enhanced Analytics & Performance Monitoring

**Drive and Document Analytics Processors**: New processors are in place to specifically handle and prepare data for analytics related to drives and documents, enabling targeted performance monitoring and insights.
**Real-Time Relational Query**: Leveraging PGlite's live query feature, the system now supports real-time queries. This means that as underlying data changes, the results of these queries are updated instantly without requiring a refresh.
**Performance Improvements in Connect Apps**: The integration of the new operational database and live query capabilities directly within the Connect UI significantly improves the performance of data retrieval and display, offering a more responsive user experience for applications built on Connect.

✅ **What to try:**

- Observe the real-time data synchronization by making changes to documents in Connect and simultaneously viewing the updates through a GraphQL interface.
- Implement search functionality within your Connect UI using the `createProcessorQuery` hook to leverage the new database schema for type-safe queries.
- Create or modify documents in Connect and watch how the changes are immediately reflected in your Connect application's display, demonstrating the live query feature.
- Explore building more complex analytical queries that span multiple documents, taking advantage of the relational store's capabilities.

### Updates for [www.staging.academy.powerhouse](https://staging.powerhouse.academy/)

#### Documentation & Guides:

- **New:** PHDocument Migration Guide - Comprehensive guide to navigate the breaking changes in v4.0.0, including step-by-step migration instructions for the document header restructuring and property access patterns.
- 🔗 https://staging.powerhouse.academy/academy/APIReferences/PHDocumentMigrationGuide
- **New:** Drive Analytics Documentation and Examples - Complete documentation for the new analytics system with practical examples showing how to implement and use drive and document analytics processors.
- 🔗 https://staging.powerhouse.academy/academy/MasteryTrack/WorkWithData/drive-analytics
- **New:** Relational Database & Operational Processor System - Educational content explaining the new architecture for data handling, querying, and synchronization
- 🔗 https://staging.powerhouse.academy/academy/APIReferences/RelationalDatabase
- **New:** Todo-List Processor Tutorial - Try to add a processor to your todo-list demo project
- 🔗 https://staging.powerhouse.academy/academy/MasteryTrack/WorkWithData/RelationalDbProcessor

#### Enhanced Learning Content:

- **Updated:** GraphQL at Powerhouse - Documentation updates reflecting the new operational processor architecture and relational database integration.
- **Updated:** Document Model Creation guides - Updated to reflect the new PHDocument structure and processor generation changes.
- **Updated:** API References - Updated CLI command documentation (automatically generated) reflecting the new ph generate schema command and other v4.0.0 changes.

🔍 See [CHANGELOG.md](./CHANGELOG.md) for the complete technical changelog with all commits and detailed changes.
Thank you 💙 Core-dev Team

## 🚀 **v3.2.0**

✨ **Highlights**

### **Drive Analytics System**

- Introducing an analytics system for drives and documents with dedicated processors for tracking operations, changes, and usage patterns.
- Analytics data is automatically collected and stored in dedicated tables, providing insights into document lifecycle and drive activity.
- New analytics query subscriptions enable real-time monitoring of the data in your drive.

✅ **What to try:** Explore the new Drive Analytics documentation in the Academy to understand how analytics processors work and how to leverage analytics data in your applications. It currently happens though an initial analytics modal with the Sky-Atlas use case. This will later be adapted to the to-do list demo project.

### **Update of Front-end Architecture & Performance**

- Feature Preview: A new set of hooks were implemented to manage state on a more granular way and avoid unnecessary rerenders.

✅ **What to try:** Initial documentation about the hooks can be found [here](https://github.com/powerhouse-inc/powerhouse/blob/main/packages/common/state/README.md)

**Feature preview:** The new hooks are not fully integrated into Connect yet, however, they can be used in custom drive editors by wrapping the editor component with the new provider:

```diff
+import { AtomStoreProvider } from "@powerhousedao/common";

export default function Editor(props: IProps) {
  return (
+    <AtomStoreProvider reactor={props.context.reactor}>
      <DriveContextProvider value={props.context}>
        <WagmiContext>
          <BaseEditor {...props} />
        </WagmiContext>
      </DriveContextProvider>
+    </AtomStoreProvider>
  );
}
```

### 🐞 **Bug Fixes**

- Fixed drag and drop functionality in the generic drive explorer
- Improved document storage with better id/slug resolution
- Enhanced build process with better Prisma handling and external package management
- Reduced unnecessary logging and improved subscription performance with debounced refetches
- Added safer validation for document properties to prevent runtime errors
- Reimplemented the Switchboard button to open the document model subgraph

### Updates for [www.staging.academy.powerhouse](https://staging.powerhouse.academy/)

- **New:** Comprehensive Drive Analytics documentation and tutorial with practical examples
- Update of the Get Started chapter
- Update of the Mastery Track - Document Creation Chapter
- Update of the Mastery Track - Work with Data - Read & Write with the API chapter
- Update of the Mastery Track - Work with Data - Analytics Processor

## 🚀 **v3.1.0**

This release brings improvements to the **Cloud Environment Setup Flow,** a Connect build, updated PH commands

### `Ph service setup` command

- We have a simplified and optimized script to guide a builder through the setup of his cloud environment with connect & switchboard services.

✅ **What to try:** Try to run the `ph service setup` flow on a cloud instance on AWS or digital ocean and install a @powerhousedao/todo-demo-package.

[https://staging.powerhouse.academy/academy/MasteryTrack/Launch/SetupEnvironment](https://staging.powerhouse.academy/academy/MasteryTrack/Launch/SetupEnvironment)

### `ph connect build` command

- We have implemented `ph connect build` which bundles the connect app with the packages installed by the user in production mode.

---

### Configure an Allowlist and add Authorization for Switchboard

- Read how to add Authorization to your drive
  - [https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/Authorization/Authorization](https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/Authorization/Authorization)
- Or try to configure your environment
  - [https://staging.powerhouse.academy/academy/MasteryTrack/Launch/ConfigureEnvironment](https://staging.powerhouse.academy/academy/MasteryTrack/Launch/ConfigureEnvironment)
  ### It’s now possible to disable the Create New Drive button in Connect.
  - We have introduced PH_CONNECT_DISABLE_ADD_DRIVE=true/false env var in connect.
    configure your environment [https://staging.powerhouse.academy/academy/MasteryTrack/Launch/ConfigureEnvironment](https://staging.powerhouse.academy/academy/MasteryTrack/Launch/ConfigureEnvironment)
  ***
  ### Find your document scalars in the stand-alone Document-Engineering
  - [https://staging.powerhouse.academy/academy/ComponentLibrary/DocumentEngineering](https://staging.powerhouse.academy/academy/ComponentLibrary/DocumentEngineering)
    ✅ **What to try: Visit the updated** [https://storybook.powerhouse.academy](https://storybook.powerhouse.academy/?path=/docs/getting-started--readme) to see the latest scalar implementations by Dspot.
  ***
  ### Performance improvements in Connect
  - We’ve optimised the way components render & avoid rerenders which results in a faster, snappier app.
  - Optimized the initial loading of Connect for an improved UX
  ***
  ### Updates on [www.staging.academy.powerhouse](https://staging.powerhouse.academy/)
  - Academy moved to the monorepo! So you have more access to code context when writing documentation. 👌
  - We’ve updated the landing page getting you directly to the ‘Get started’ section & Tutorial
  - Still confused how to create a drive via mutations?
    ‘Configure a drive’ is now available to help you out. [https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/ConfiguringDrives](https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/ConfiguringDrives)
  - New educational content is present inside the ‘Mastery track’ guiding you through the advanced ToDoList Demo. [https://staging.powerhouse.academy/academy/MasteryTrack/DocumentModelCreation/WhatIsADocumentModel](https://staging.powerhouse.academy/academy/MasteryTrack/DocumentModelCreation/WhatIsADocumentModel)
  - The first page inside our API references chapter is now automatically updated with all the latest available commands for the Powerhouse CLI
    [https://staging.powerhouse.academy/academy/APIReferences/PowerhouseCLI](https://staging.powerhouse.academy/academy/APIReferences/PowerhouseCLI)

---

## 🚀 **v1.0.22 ⇒ v1.1.0**

[https://connect.phd/](https://staging.connect.phd/)

This release brings improvements that make it easier to **work with the Powerhouse CLI, understand available commands, and develop with greater confidence.**

✨ **Highlights**

### **Better CLI Documentation & Help**

- You’ll notice clearer help messages when you run `ph help` or `ph {command} --help` (e.g. `ph init --help`). We’ve redesigned the help output to be **more readable and useful right from your terminal.**
- Running `ph --version` now shows **additional context about your CLI installation** to help debug or verify your setup.

👉 **View the latest commands documentation here: [COMMANDS.md on GitHub](./clis/ph-cli/COMMANDS.md)
(Soon on academy too)**

✅ **What to try:** Run `ph help` or `ph init --help` and see the improved help output. Check out the online docs if you prefer reading in markdown!

---

### **Improved Project Initialization & Dependency Management**

- `ph init`, `ph setup-globals`, `ph update`, and `ph use` have **improved error handling and clearer messages** to guide you through project setup and environment switching.
- We’ll continue making these commands more interactive with the help of the `interactive-commander` library soon.
- Dependency updates to latest versions of `vite`, `vitest`, `tailwindcss` and more keep your projects aligned with latest versions.

✅ **What to try:** Run `ph update` in your project to pull in the latest compatible Powerhouse dependencies.

---

### **Improved Document Model Editing & Validation**

- We’ve made the SDL parsing and schema validation **safer and more reliable**, reducing cryptic GraphQL errors in the editor, to make document model definition a bit more reliable.
- A drive editor refactor for `DriveEditorContainer` and `DriveExplorer` inside Drive Explorer nowsupport dynamic document model and editor module injection. Giving you a smoother custom drive editor experience.

✅ **What to try:** Open a document in Studio mode and test schema edits or validation—error handling should feel more predictable/not brick your document model.

---

### **Cleaner Drive Deletion Across Storages**

- Removing a drive from your local storage, filesystem, or browser storage is now **more consistent and reliable.** You now have unified drive deletion behavior across `BrowserStorage`, `FilesystemStorage`, and `MemoryStorage` to ensure consistent data cleanup.
- You can now delete a drive and **immediately recreate a new one with the same ID and slug without issues.**

✅ **What to try:** Delete a drive and re-add it with the same ID to confirm a clean reset.

### 🐞 **Bug Fixes**

- Resolved an issue where `ph add` didn’t properly clean up installed packages.
- Fixed missing type imports and inconsistencies in CLI command modules.
- Addressed redundant drive deletion logic across storage layers.

**Complete Changelog & published package version can be found here:**

- An overview of the complete changelog of the past weeks can be found here!: https://github.com/powerhouse-inc/powerhouse/commit/e665c1e53dbcbbf7a7a701266522152b9c767f95. (There might be an opportunity here for the other teams to start communicating about their releases too as we are slowly gaining momentum !)

---

**Several updates for:** [https://staging.academy.powerhouse/](https://staging.academy.powerhouse/) 📖

- Added page: Setup environment & deployment guide
- Added page: Working with the Supergraph
- Added WIP page: Reusable component & Design System
- Added ph recipes: Editor creation, Supergraphs vs Subgraphs
- Updated Page: Publish packages & Run on cloud server
- Updated Page: Editor & Drive explorer creation
- Starting general spellcheck & consistency in terminology!

Thank you <3
