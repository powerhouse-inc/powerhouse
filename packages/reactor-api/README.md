# @powerhousedao/reactor-api

A powerful API server implementation for the Powerhouse ecosystem that provides GraphQL capabilities, document processing, and package management.

## Features

- 🚀 Express-based API server with GraphQL support
- 📦 Flexible package management system
- 🔄 Document processing and event handling
- 🔐 Authentication and authorization support
- 📊 Analytics integration
- 🗄️ Database management with PostgreSQL support
- 🔌 Extensible subgraph system

## Installation

```bash
npm install @powerhousedao/reactor-api
```

## Quick Start

```typescript
import { startAPI } from '@powerhousedao/reactor-api';

const api = await startAPI(reactor, {
  port: 3000,
  dbPath: './data',
  auth: {
    enabled: true,
    admins: ['0x...'],
    users: ['0x...'],
    guests: ['0x...']
  }
});
```

## Core Components

### API Server
The API server provides a robust Express-based implementation with GraphQL support, authentication middleware, and HTTPS capabilities.

### Package Manager
Manages document models, subgraphs, and processors through a flexible loading system that supports multiple package sources.

### GraphQL Manager
Handles GraphQL operations, subgraph management, and schema composition using Apollo Server.

### Processor Manager
Manages document processors and their lifecycle, including registration and event handling.

## Configuration

The API can be configured with the following options:

```typescript
type Options = {
  express?: Express;
  port?: number;
  dbPath: string;
  client?: PGlite | Pool;
  configFile?: string;
  packages?: string[];
  auth?: {
    enabled: boolean;
    guests: string[];
    users: string[];
    admins: string[];
  };
  https?: {
    keyPath: string;
    certPath: string;
  } | boolean;
  packageLoader?: IPackageLoader;
};
```

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test

# Run linter
npm run lint
```

## License

AGPL-3.0-only - See [LICENSE](LICENSE) for details.
