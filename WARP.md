# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Essential Development Commands

### Core Build and Test Commands
```bash
# Install dependencies
pnpm install

# Build all packages and apps
pnpm build
# Or: pnpm nx run-many --target=build --all

# Run tests across all packages
pnpm test:all
# Or: pnpm nx run-many --target=test --all

# Lint all code
pnpm lint:all
# Or: pnpm nx run-many --target=lint:nx --all

# Check everything (build + lint + test)
pnpm check:all
```

### Working with Specific Packages/Apps
```bash
# Build a specific package
npx nx build <package-name>

# Run a specific app (e.g., Switchboard)
npx nx start @powerhousedao/switchboard

# Run Connect app in development
npx nx dev @powerhousedao/connect

# Test a specific package
npx nx test <package-name>

# Run tests in watch mode
npx nx test <package-name> --watch
```

### Package Management and Releases
```bash
# Perform initial release for a new package
npx nx release --first-release --projects=<package-name> --dry-run

# Release new versions (after merging changes)
npx nx release --projects=<package-name>

# Clean all build outputs
pnpm clean
# Or: pnpm nx run-many --target=clean --all
```

### Docker Commands
```bash
# Build and start all services
docker compose up

# Start specific service
docker compose up switchboard
docker compose up connect

# Rebuild and start with latest changes
docker compose up --build
```

## Architecture Overview

### Monorepo Structure
This is a **pnpm workspace** managed by **Nx** with the following key directories:
- `packages/` - Core libraries and shared packages
- `apps/` - Applications (Connect, Switchboard, Academy)  
- `clis/` - Command-line tools (ph-cli, ph-cmd)

### Core Architecture: Document Model System

The foundation of Powerhouse is an **operation-based document system** where:

1. **Documents** are immutable state containers with a history of operations
2. **Operations** are atomic transformations that modify document state
3. **Synchronization** happens through operation exchange between nodes

#### Key Components

**Document Model (`packages/document-model/`)**
- Defines the core document structure and operation system
- Operations are ordered, indexed, and can be replayed to rebuild state
- Supports undo/redo through operation history
- Each operation has: `index`, `skip`, `timestamp`, `hash`, and `action`

**Document Drive (`packages/document-drive/`)**
- Manages collections of documents with synchronization capabilities  
- Handles document storage, caching, and cross-drive operations
- Implements pull/push synchronization between drives
- Supports offline-first operations with conflict resolution

**Connect App (`apps/connect/`)**
- React-based document editor and viewer
- Uses Vite with React, TailwindCSS, and various document model integrations
- Supports plugin architecture for different document types
- Built for both web and desktop deployment

**Switchboard App (`apps/switchboard/`)**
- Node.js server that manages document synchronization  
- Handles GraphQL API, database operations, and cross-drive sync
- Can run standalone or as part of larger Powerhouse infrastructure

### Operation Lifecycle

Operations follow this pattern:
1. **Creation** - User action or system process creates an operation
2. **Validation** - Operation is checked for conflicts and consistency  
3. **Application** - Operation transforms document state
4. **Persistence** - Operation is stored in document history
5. **Synchronization** - Operation propagates to other nodes

### Synchronization Architecture

Documents sync through **strand updates** containing batched operations:
- Pull-based sync: Nodes periodically request updates
- Push-based sync: Nodes actively send updates when changes occur  
- Conflict resolution through operation ordering and timestamps
- Support for offline work with eventual consistency

## Development Patterns

### Package Dependencies
- Use `workspace:*` for internal dependencies in package.json
- Build dependencies are managed through Nx dependency graph
- Packages build in dependency order automatically

### Testing Strategy
- Unit tests using Vitest across packages
- Integration tests for document operations and sync
- E2E tests for Connect app using Playwright

### Code Generation
- Document models use code generation from schemas
- GraphQL operations are generated from schema definitions
- Use `packages/codegen` for automated code generation tasks

### Release Process
- Conventional commits determine version bumps
- Nx release automation handles versioning and publishing
- GitHub Actions handle CI/CD and NPM publishing
- Each package can be released independently

## Key File Locations

### Configuration
- `nx.json` - Nx workspace configuration
- `package.json` - Root workspace dependencies and scripts
- `vitest.workspace.ts` - Test configuration
- `eslint.config.js` - Linting rules
- `tsconfig.json` - TypeScript project references

### Core Packages
- `packages/document-model/` - Core document and operation system
- `packages/document-drive/` - Document storage and synchronization  
- `packages/design-system/` - Shared UI components
- `packages/common/` - Shared utilities and types

### Applications
- `apps/connect/` - Document editor application
- `apps/switchboard/` - Synchronization server
- `clis/ph-cli/` - Command-line interface for Powerhouse operations

## Environment Setup

Requires:
- Node.js >= 22.0.0 (specified in package.json engines)
- pnpm 10.10.0+ (specified as packageManager)
- Docker (optional, for containerized development)

The project uses TypeScript 5.7+ with strict configuration and modern ES modules throughout.
