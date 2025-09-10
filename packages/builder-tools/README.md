# @powerhousedao/builder-tools

A comprehensive toolkit for building and managing Powerhouse DAO applications. This package provides essential tools and utilities for development, including document model editing, connection management, and various editor utilities.

## Features

- **Connect Studio**: Tools for managing and configuring connections
- **Connect Build**: Build utilities for connection management
- **Document Model Editor**: A powerful editor for document models
- **Editor Utils**: Common utilities for editor functionality
- **Connect Utils**: Shared utilities for connection management

## Installation

```bash
npm install @powerhousedao/builder-tools
```

## Usage

The package provides several modules that can be imported as needed:

```typescript
// Import specific modules
import { ... } from '@powerhousedao/builder-tools/connect-studio';
import { ... } from '@powerhousedao/builder-tools/connect-build';
import { ... } from '@powerhousedao/builder-tools/document-model-editor';
import { ... } from '@powerhousedao/builder-tools/editor-utils';

// Import styles
import '@powerhousedao/builder-tools/style.css';
```

## Development

### Prerequisites

- Node.js (Latest LTS version recommended)
- npm or yarn

### Setup

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

### Available Scripts

- `npm run build` - Build the package
- `npm run build:css` - Build CSS files
- `npm run storybook` - Run Storybook development server
- `npm run lint` - Run ESLint
- `npm run lint:nx` - Run ESLint with auto-fix
- `npm run clean` - Clean build artifacts

## Dependencies

This package has several key dependencies:

- React 18+
- TailwindCSS
- CodeMirror 6
- GraphQL Tools
- Various Radix UI components
- And more (see package.json for complete list)

## License

AGPL-3.0-only

## Contributing

Please read our contributing guidelines before submitting pull requests.

## Support

For support, please open an issue in the repository or contact the Powerhouse DAO team.
