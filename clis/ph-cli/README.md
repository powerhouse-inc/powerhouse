# Powerhouse CLI (ph-cli)

A command-line interface tool for Powerhouse DAO that helps you manage and interact with Powerhouse packages and services.

## Installation

```bash
npm install ph-cli
```

## Available Commands

### `ph connect`

Starts Connect Studio, a development environment for Powerhouse.

#### Options:
- `-p, --port <port>`: Port to run the server on (default: 3000)
- `-h, --host`: Expose the server to the network
- `--https`: Enable HTTPS
- `--open`: Open the browser automatically
- `--config-file <configFile>`: Path to the powerhouse.config.js file

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

Generate code from document models with various options.

#### Options:
- `-i, --interactive`: Run the command in interactive mode
- `--editors <type>`: Path to the editors directory
- `-e, --editor <type>`: Editor Name
- `--file <path>`: File path to document model
- `--processors <type>`: Path to the processors directory
- `-p, --processor <type>`: Processor Name
- `--processor-type <type>`: Processor Type (operational/analytics)
- `-s, --subgraph <type>`: Subgraph Name
- `--document-models <type>`: Path to the document models directory
- `--document-types <type>`: Supported document types by the editor
- `-is, --import-script <type>`: Import Script Name
- `-sf, --skip-format`: Skip formatting the generated code
- `-w, --watch`: Watch the generated code
- `-d, --drive-editor <name>`: Generate a drive editor with the specified name

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
ph generate --processor myProcessor --processor-type operational

# Generate a subgraph
ph generate --subgraph mySubgraph --file path/to/model.json

# Generate an import script
ph generate --import-script myImportScript

# Watch mode for continuous generation
ph generate --watch
```

### `ph install` (or `ph add`, `ph i`)

Install Powerhouse dependencies.

#### Options:
- `-g, --global`: Install the dependency globally
- `--debug`: Show additional logs
- `-w, --workspace`: Install the dependency in the workspace (use this option for monorepos)
- `--package-manager <packageManager>`: Force package manager to use

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

Remove Powerhouse dependencies.

#### Options:
- `-g, --global`: Remove the dependency globally
- `--debug`: Show additional logs
- `-w, --workspace`: Remove the dependency in the workspace (use this option for monorepos)
- `--package-manager <packageManager>`: Force package manager to use

```bash
# Remove a package
ph uninstall @powerhousedao/package-name

# Remove globally
ph uninstall -g @powerhousedao/package-name

# Remove from workspace
ph uninstall -w @powerhousedao/package-name
```

### `ph list` (or `ph l`)

List all installed Powerhouse packages in your project.

#### Options:
- `--debug`: Show additional logs

```bash
# List packages
ph list

# List with debug information
ph list --debug
```

### `ph inspect` (or `ph is`)

Inspect a specific package.

#### Options:
- `--debug`: Show additional logs

```bash
# Inspect a package
ph inspect @powerhousedao/package-name

# Inspect with debug information
ph inspect --debug @powerhousedao/package-name
```

### `ph service`

Manage Powerhouse services.

#### Options:
- `action`: The action to perform (default: "list")
- `service`: The service to manage (default: "all")

```bash
# List all services
ph service list

# List specific service
ph service list service-name
```

### `ph version` (or `ph v`)

Display the current version of the PH CLI.

#### Options:
- `--debug`: Show additional logs

```bash
ph version
```

### `ph help`

Display help information about the CLI and its commands.

```bash
# Show general help
ph help

# Show help for specific command
ph help <command>
```

## Global Options

Most commands support the following global options:

- `--debug`: Show additional debug logs
- `--package-manager <manager>`: Force the use of a specific package manager

## Contributing

Please refer to the project's contribution guidelines for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the terms specified in the LICENSE file.