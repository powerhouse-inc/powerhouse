# Powerhouse CLI (ph-cli)

[![npm version](https://img.shields.io/npm/v/ph-cli.svg)](https://www.npmjs.com/package/ph-cli)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A powerful command-line interface tool for Powerhouse DAO that streamlines the development and management of Powerhouse packages and services. The CLI provides a unified interface for common development tasks, package management, and service operations.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
  - [Connect](#ph-connect)
  - [Generate](#ph-generate)
  - [Install](#ph-install)
  - [Uninstall](#ph-uninstall)
  - [List](#ph-list)
  - [Inspect](#ph-inspect)
  - [Service](#ph-service)
  - [Version](#ph-version)
  - [Help](#ph-help)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Features

- 🚀 Fast and efficient package management
- 🔧 Powerful code generation capabilities
- 🌐 Connect Studio development environment
- 📦 Workspace-aware package operations
- 🔍 Package inspection and dependency management
- 🛠 Service management and monitoring
- 📝 Comprehensive documentation and help system

## Installation

```bash
# Install globally
npm install -g ph-cli

# Install as a dev dependency
npm install --save-dev ph-cli
```

## Quick Start

```bash
# Initialize a new Powerhouse project
ph init

# Start the development environment
ph connect

# Install required dependencies
ph install @powerhousedao/core

# Generate code from models
ph generate --interactive
```

## Commands

### `ph connect`

Starts Connect Studio, a development environment for Powerhouse. This command launches a local development server with hot-reloading and debugging capabilities.

#### Options:

- `-p, --port <port>`: Port to run the server on (default: 3000)
- `-h, --host`: Expose the server to the network
- `--https`: Enable HTTPS
- `--open`: Open the browser automatically
- `--config-file <configFile>`: Path to the powerhouse.config.js file

#### Examples:

```bash
# Start Connect Studio on default port (3000)
ph connect

# Start on a specific port
ph connect --port 4000

# Expose to network and enable HTTPS
ph connect --host --https

# Open in browser automatically
ph connect --open

# Use custom config file
ph connect --config-file ./my-config.js
```

### `ph generate`

Generate code from document models with various options. This command supports multiple generation types including editors, processors, subgraphs, and import scripts.

#### Options:

- `-i, --interactive`: Run the command in interactive mode
- `--editors <type>`: Path to the editors directory
- `-e, --editor <type>`: Editor Name
- `--file <path>`: File path to document model
- `--processors <type>`: Path to the processors directory
- `-p, --processor <type>`: Processor Name
- `--processor-type <type>`: Processor Type (relationalDb/analytics)
- `-s, --subgraph <type>`: Subgraph Name
- `--document-models <type>`: Path to the document models directory
- `--document-types <type>`: Supported document types by the editor
- `-is, --import-script <type>`: Import Script Name
- `-sf, --skip-format`: Skip formatting the generated code
- `-w, --watch`: Watch the generated code
- `-d, --drive-editor <name>`: Generate a drive editor with the specified name

#### Examples:

```bash
# Generate code from a specific file
ph generate path/to/model.json

# Generate in interactive mode
ph generate -i

# Generate a drive editor
ph generate --drive-editor myEditor

# Generate an editor with specific document types
ph generate --editor myEditor --document-types "type1,type2"

# Generate a processor
ph generate --processor myProcessor --processor-type relationalDb

# Generate a subgraph
ph generate --subgraph mySubgraph --file path/to/model.json

# Generate an import script
ph generate --import-script myImportScript

# Watch mode for continuous generation
ph generate --watch
```

### `ph install` (or `ph add`, `ph i`)

Install Powerhouse dependencies with support for global and workspace-specific installations.

#### Options:

- `-g, --global`: Install the dependency globally
- `--debug`: Show additional logs
- `-w, --workspace`: Install the dependency in the workspace (use this option for monorepos)
- `--package-manager <packageManager>`: Force package manager to use

#### Examples:

```bash
# Install a package
ph install @powerhousedao/package-name

# Install globally
ph install -g @powerhousedao/package-name

# Install in workspace (for monorepos)
ph install -w @powerhousedao/package-name

# Install multiple packages
ph install @powerhousedao/package1 @powerhousedao/package2
```

### `ph uninstall` (or `ph remove`)

Remove Powerhouse dependencies from your project.

#### Options:

- `-g, --global`: Remove the dependency globally
- `--debug`: Show additional logs
- `-w, --workspace`: Remove the dependency in the workspace (use this option for monorepos)
- `--package-manager <packageManager>`: Force package manager to use

#### Examples:

```bash
# Remove a package
ph uninstall @powerhousedao/package-name

# Remove globally
ph uninstall -g @powerhousedao/package-name

# Remove from workspace
ph uninstall -w @powerhousedao/package-name
```

### `ph list` (or `ph l`)

List all installed Powerhouse packages in your project with detailed information.

#### Options:

- `--debug`: Show additional logs

#### Examples:

```bash
# List packages
ph list

# List with debug information
ph list --debug
```

### `ph inspect` (or `ph is`)

Inspect a specific package for detailed information about its dependencies, configuration, and usage.

#### Options:

- `--debug`: Show additional logs

#### Examples:

```bash
# Inspect a package
ph inspect @powerhousedao/package-name

# Inspect with debug information
ph inspect --debug @powerhousedao/package-name
```

### `ph service`

Manage Powerhouse services with various operations.

#### Options:

- `action`: The action to perform (default: "list")
- `service`: The service to manage (default: "all")

#### Examples:

```bash
# List all services
ph service list

# List specific service
ph service list service-name
```

### `ph version` (or `ph v`)

Display the current version of the PH CLI and related information.

#### Options:

- `--debug`: Show additional logs

#### Examples:

```bash
ph version
```

### `ph help`

Display comprehensive help information about the CLI and its commands.

#### Examples:

```bash
# Show general help
ph help

# Show help for specific command
ph help <command>
```

## Configuration

The CLI can be configured using a `powerhouse.config.js` file in your project root. Here's an example configuration:

```javascript
module.exports = {
  port: 3000,
  host: false,
  https: false,
  packageManager: "npm",
  workspace: {
    enabled: true,
    root: "./packages",
  },
};
```

## Troubleshooting

### Common Issues

1. **Command not found**
   - Ensure ph-cli is installed globally or locally
   - Check your PATH environment variable

2. **Permission errors**
   - Use sudo for global installations
   - Check directory permissions

3. **Package installation failures**
   - Clear npm cache: `npm cache clean --force`
   - Check network connectivity
   - Verify package name and version

### Debug Mode

Most commands support a `--debug` flag for additional logging:

```bash
ph install --debug @powerhousedao/package-name
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:

- Code of Conduct
- Development Process
- Pull Request Process
- Style Guide
- Testing Requirements

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
