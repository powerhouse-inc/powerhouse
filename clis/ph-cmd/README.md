# Powerhouse Command (ph-cmd)

A command-line interface tool for Powerhouse DAO that helps you manage project dependencies, environments, and initialization. This CLI acts as a wrapper around `ph-cli`, forwarding commands to the appropriate project context.

## Command Forwarding

The `ph-cmd` CLI automatically forwards commands to `ph-cli` when they are not part of its core functionality. It determines the project context by:

1. Looking for a `powerhouse.config.json` file in the current directory
2. If not found, searching up the directory tree for the nearest `powerhouse.config.json`
3. Using the project's package manager (npm, yarn, or pnpm) to execute the command in the correct context

For example, when you run `ph install` in a project directory, `ph-cmd` will:
1. Detect the project's package manager from the lockfile
2. Forward the command to `ph-cli` with the correct project context
3. Execute the command using the project's package manager

## Installation

```bash
npm install -g ph-cmd
```

When installed globally, `ph-cmd` creates a default project in your home directory under `.ph/`. This default project serves as a fallback context when no other project context is found. The default project is initialized with basic Powerhouse configurations and can be customized using the `ph setup-globals` command.

## Available Commands

### `ph init`

Initialize a new Powerhouse project.

#### Options:
- `-p, --project`: Name of the project
- `-i, --interactive`: Run the command in interactive mode
- `-v, --version`: Specify development version to use (defaults to "main")
- `--dev`: Use "development" version of the boilerplate
- `--staging`: Use "development" version of the boilerplate
- `--package-manager <packageManager>`: Force package manager to use

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

### `ph use`

Change your environment (latest, development, production, or local).

#### Options:
- `--package-manager <packageManager>`: Force package manager to use
- `--debug`: Show additional logs

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

### `ph update`

Update your dependencies to the latest version based on the specified range in package.json.

#### Options:
- `--force <env>`: Force update to latest available version for the environment specified (dev, prod, latest)
- `--package-manager <packageManager>`: Force package manager to use
- `--debug`: Show additional logs

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

### `ph setup-globals`

Set up global configurations for Powerhouse.

#### Options:
- `--debug`: Show additional logs

```bash
# Set up global configurations
ph setup-globals

# Set up with debug information
ph setup-globals --debug
```

## Global Options

Most commands support the following global options:

- `--verbose`: Enable debug mode
- `--package-manager <manager>`: Force the use of a specific package manager
- `--debug`: Show additional debug logs

## Supported Package Managers

The CLI supports the following package managers:
- npm
- yarn
- pnpm

## Contributing

Please refer to the project's contribution guidelines for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the terms specified in the LICENSE file.