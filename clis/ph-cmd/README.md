# Powerhouse Command (ph-cmd)

[![npm version](https://img.shields.io/npm/v/ph-cmd.svg)](https://www.npmjs.com/package/ph-cmd)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A powerful command-line interface tool for Powerhouse DAO that streamlines project management, dependency handling, and environment configuration. This CLI serves as an intelligent wrapper around `ph-cli`, providing seamless command forwarding and context-aware execution.

## Features

- 🔄 Automatic command forwarding to `ph-cli`
- 🎯 Smart project context detection
- 📦 Multi-package manager support (npm, yarn, pnpm)
- 🌍 Environment management (dev, prod, latest, local)
- ⚡ Fast and efficient dependency updates
- 🔧 Global configuration management

## Prerequisites

- Node.js (v14 or higher)
- npm, yarn, or pnpm installed
- Git (for version control)

## Installation

```bash
# Using npm
npm install -g ph-cmd

# Using yarn
yarn global add ph-cmd

# Using pnpm
pnpm add -g ph-cmd
```

After installation, `ph-cmd` creates a default project in your home directory under `.ph/`. This serves as a fallback context when no other project context is found. The default project comes with basic Powerhouse configurations and can be customized using the `ph setup-globals` command.

## Project Context Detection

The CLI automatically determines the project context by:

1. Looking for a `powerhouse.config.json` file in the current directory
2. If not found, searching up the directory tree for the nearest `powerhouse.config.json`
3. Using the project's package manager (npm, yarn, or pnpm) to execute commands in the correct context

## Core Commands

### Project Initialization

```bash
# Initialize a new project
ph init my-project

# Initialize in interactive mode
ph init -i

# Initialize with specific version
ph init -v v1.0.0

# Initialize using development version
ph init --dev

# Initialize with specific package manager
ph init --package-manager pnpm
```

#### Options:
- `-p, --project`: Name of the project
- `-i, --interactive`: Run the command in interactive mode
- `-v, --version`: Specify development version to use (defaults to "main")
- `--dev`: Use "development" version of the boilerplate
- `--staging`: Use "development" version of the boilerplate
- `--package-manager <packageManager>`: Force package manager to use

### Environment Management

```bash
# Switch to latest environment
ph use latest

# Switch to development environment
ph use dev

# Switch to production environment
ph use prod

# Switch to local environment with specific path
ph use local /path/to/local/env

# Use specific package manager
ph use latest --package-manager pnpm
```

#### Options:
- `--package-manager <packageManager>`: Force package manager to use
- `--debug`: Show additional logs

### Dependency Updates

```bash
# Update dependencies based on package.json ranges
ph update

# Force update to latest dev version
ph update --force dev

# Force update to latest stable version
ph update --force prod

# Force update to latest version (same as prod)
ph update --force latest

# Update using specific package manager
ph update --package-manager pnpm

# Update with debug information
ph update --debug
```

#### Options:
- `--force <env>`: Force update to latest available version for the environment specified (dev, prod, latest)
- `--package-manager <packageManager>`: Force package manager to use
- `--debug`: Show additional logs

### Global Configuration

```bash
# Set up global configurations
ph setup-globals

# Set up with debug information
ph setup-globals --debug
```

#### Options:
- `--debug`: Show additional logs

## Global Options

Most commands support these global options:

- `--verbose`: Enable debug mode
- `--package-manager <manager>`: Force the use of a specific package manager
- `--debug`: Show additional debug logs

## Common Use Cases

### Setting Up a New Project

```bash
# Initialize a new project with npm
ph init my-project --package-manager npm

# Set up global configurations
ph setup-globals

# Switch to development environment
ph use dev
```

### Updating Dependencies

```bash
# Update to latest stable version
ph update --force prod

# Update with specific package manager
ph update --package-manager pnpm
```

## Troubleshooting

### Common Issues

1. **Command not found**
   - Ensure `ph-cmd` is installed globally
   - Check if the installation path is in your system's PATH

2. **Project context not found**
   - Verify you're in a Powerhouse project directory
   - Check for the presence of `powerhouse.config.json`

3. **Package manager conflicts**
   - Use `--package-manager` flag to specify the correct manager
   - Ensure the specified package manager is installed

### Debug Mode

Enable debug mode to get detailed information about command execution:

```bash
ph <command> --debug
```

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details on:

- Code of Conduct
- Development Process
- Pull Request Process
- Coding Standards

## License

This project is licensed under the terms specified in the [LICENSE](LICENSE) file.

## Support

For support, please:
1. Check the [documentation](https://docs.powerhouse.com)
2. Open an [issue](https://github.com/powerhouse/ph-cmd/issues)
3. Join our [Discord community](https://discord.gg/powerhouse)