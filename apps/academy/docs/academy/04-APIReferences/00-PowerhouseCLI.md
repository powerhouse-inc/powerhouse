# Powerhouse CLI

### Installing the Powerhouse CLI 
:::tip
The **Powerhouse CLI tool** is the only essential tool to install on this page. Install it with the command below.    

You can find all of the commands on this page, similar to what would displayed when using ph --help or ph *command* --help. 
Use the table of content or the search function to find what you are looking for.   

The Powerhouse CLI (`ph-cmd`) is a command-line interface tool that provides essential commands for managing Powerhouse projects. You can get access to the Powerhouse ecosystem tools by installing them globally.

```bash
pnpm install -g ph-cmd
``` 
 :::

<!-- AUTO-GENERATED-CLI-COMMANDS-START -->\n<!-- This content is automatically generated. Do not edit directly. -->\n### ph-cmd Commands\n\n- [Init](#init)
- [Setup Globals](#setup-globals)
- [Update](#update)
- [Use](#use)

## Init

```
Command Overview:
  The init command creates a new Powerhouse project with optimal defaults. It sets up a fully 
  configured project structure with all necessary dependencies, configurations, and boilerplate.

  This command:
  1. Creates a new project with the specified name
  2. Installs all required dependencies for Powerhouse development
  3. Sets up a proper project structure and configuration files
  4. Can run in interactive mode for customized setup

Arguments:
  [project-name]        Optional. Name of the project to create. If not provided,
                        you'll be prompted to provide a name, or the current directory 
                        will be used if in interactive mode.

Options:
  -p, --project         Specify the name of the project to create.
                        
  -i, --interactive     Run the command in interactive mode, which will guide you
                        through the project setup with customizable options.
                        
  -v, --version         Specify the development version to use. Defaults to "main".
                        
  --dev                 Use the "development" version of the boilerplate.
                        
  --staging             Use the "staging" version of the boilerplate.
                        
  --package-manager     Override the auto-detected package manager with the specified one.

Project Structure:
  The command will create a complete project with:
  - Properly configured TypeScript and build settings
  - Powerhouse document-model integration
  - All necessary package.json dependencies
  - Development scripts and tooling

Examples:
  $ ph init my-awesome-project                                # Create a new project named "my-awesome-project"
  $ ph init -i                                                # Create a project in interactive mode
  $ ph init -p my-project                                     # Same as ph init my-project
  $ ph init --dev                                             # Use development version of boilerplate
  $ ph init -v beta                                           # Use specific version
  $ ph init --package-manager yarn                            # Use yarn as package manager
  $ ph init my-awesome-project --dev --package-manager pnpm   # Create a project with Powerhouse dev packages and pnpm as package manager
```

## Setup Globals

```
Command Overview:
  The setup-globals command initializes a new Powerhouse project with the necessary global 
  configuration. It helps you set up a project quickly with proper defaults and dependencies.

  This command:
  1. Creates a new project with the specified name or in the current directory
  2. Sets up all required Powerhouse dependencies
  3. Configures the project with appropriate settings
  4. Can run in interactive mode to guide you through the setup process

Arguments:
  [project-name]        Optional. Name of the project to create. If not provided,
                        the command will use the current directory.

Options:
  -p, --project         Specify the name of the project to create.
                        
  -i, --interactive     Run the command in interactive mode, which will guide you
                        through the setup process with questions and prompts.
                        
  -v, --version         Specify the development version to use. Defaults to "main".
                        
  --dev                 Use the "development" version of the boilerplate.
                        
  --staging             Use the "staging" version of the boilerplate.
                        
  --package-manager     Override the auto-detected package manager with the specified one.

Project Structure:
  The command will set up a project with the following structure:
  - Proper configuration files for TypeScript and ESLint
  - Dependencies for Powerhouse packages
  - Build and development scripts

Examples:
  $ ph setup-globals my-project          # Create a new project named "my-project"
  $ ph setup-globals                     # Set up a project in the current directory
  $ ph setup-globals -i                  # Run setup in interactive mode
  $ ph setup-globals --dev               # Use development version
  $ ph setup-globals -v beta             # Use specific version
  $ ph setup-globals --package-manager npm   # Use npm as package manager
```

## Update

```
Command Overview:
  The update command helps you manage and update Powerhouse dependencies in your project. It provides
  an efficient way to keep your project up-to-date with the latest versions of Powerhouse packages.
  
  This command:
  1. Updates all Powerhouse dependencies based on the semver ranges specified in your package.json
  2. Can force update all dependencies to a specific environment version (dev, prod, latest)
  3. Automatically builds any local dependencies before updating
  4. Works with all dependencies with @powerhousedao/ prefix and special packages like document-model

Options:
  --force <env>         Force update to the latest available version for the environment specified.
                        Valid environments: dev, prod, latest.
                        - dev: Uses @dev tag for all dependencies
                        - prod/latest: Uses @latest tag for all dependencies
                        
  --package-manager     Override the auto-detected package manager with the specified one.
                        
  --debug               Show additional logs while executing the command.

Special Cases:
  - Local Dependencies: If you have dependencies linked from a local monorepo (using file: or link:
    protocols), the command will detect the monorepo root, build affected packages, then update.
  
  - No Dependencies: If no Powerhouse dependencies are found in your project, the command will
    display a message and exit without making changes.

Examples:
  $ ph update                          # Update dependencies based on package.json ranges
  $ ph update --force dev              # Force update to latest dev version available
  $ ph update --force prod             # Force update to latest stable version available (same as latest)
  $ ph update --force latest           # Force update to latest stable version available (same as prod)
  $ ph update --package-manager pnpm   # Specify package manager to use
  $ ph update --debug                  # Show debug information during update
```

## Use

```
Command Overview:
  The use command allows you to quickly switch between different environments for all Powerhouse
  dependencies in your project. It provides a convenient way to toggle between development,
  production, and local versions of the packages.

  This command:
  1. Updates all installed Powerhouse dependencies to the specified environment
  2. Can link to local dependencies from a monorepo for development
  3. Only updates dependencies that are already present in your package.json
  4. Supports special packages without the @powerhousedao prefix

Arguments:
  <environment>         Required. The environment to use. Valid options:
                        - dev: Use development versions (@dev tag)
                        - prod/latest: Use production versions (@latest tag)
                        - local: Use local filesystem versions (requires localPath)
                        
  [localPath]           Path to the local monorepo. Required when environment is 'local'.
                        This should be the root of your Powerhouse monorepo.

Options:
  --force               Force environment to use, even if not in the predefined list
                        
  --package-manager     Override the auto-detected package manager with the specified one.
                        
  --debug               Show additional logs during execution for troubleshooting.

  --use-resolved        Resolves tags to their actual version numbers. For example:
                        - @dev tag will be resolved to the latest dev version (e.g. v1.0.1-dev.1)
                        - @latest tag will be resolved to the latest stable version (e.g. v1.0.0)
                        This ensures you get the exact version that matches the tag.

Special Cases:
  - Local Development: When using the 'local' environment, dependencies are linked directly
    to local filesystem paths, allowing for real-time development and testing.
  
  - Missing Dependencies: The command only updates Powerhouse dependencies that are already
    installed in your project. It won't add new ones.

Examples:
  $ ph use dev                       # Switch all dependencies to development versions
  $ ph use prod                      # Switch all dependencies to production versions
  $ ph use latest                    # Same as 'prod', use latest production versions
  $ ph use local /path/to/monorepo   # Link to local versions in the specified monorepo
  $ ph use dev --package-manager npm # Use npm instead of the auto-detected package manager
  $ ph use dev --debug               # Show debug information during execution
  $ ph use dev --use-resolved        # Resolve @dev tags to actual version numbers (e.g. v1.0.1-dev.1)
```

---

*This document was automatically generated from the help text in the codebase.*\n\n### ph-cli Commands\n\n- [Connect Build](#connect-build)
- [Connect Preview](#connect-preview)
- [Connect Studio](#connect-studio)
- [Dev](#dev)
- [Generate](#generate)
- [Inspect](#inspect)
- [Install](#install)
- [List](#list)
- [Reactor](#reactor)
- [Service](#service)
- [Switchboard](#switchboard)
- [Uninstall](#uninstall)
- [Version](#version)

## Connect Build

```
Command Overview:
  The Connect build command creates a connect build with the project's local and external packages included.

Options:
  --base <path> The base path for the app. Default is "/".
  --project-root <path>  The root directory of the project. Default is "process.cwd()".
  --assets-dir-name <name> The name of the assets directory. Default is "${DEFAULT_ASSETS_DIR_NAME}".
  --external-packages-file-name <name> The name of the external packages file. Default is "${DEFAULT_EXTERNAL_PACKAGES_FILE_NAME}".
  --styles-file-name <name> The name of the styles file. Default is "${DEFAULT_STYLES_FILE_NAME}".
  --connect-path <path>  The path to the Connect dist directory. Calls "resolveConnect()" if not provided.
```

## Connect Preview

```
Command Overview:
  The Connect preview command previews a built Connect project.
  NOTE: You must run \`ph connect build\` first.

Options:
  --base <path>          The base path for the app. Default is "/".
  --project-root <path>  The root directory of the project. Default is "process.cwd()".
  --port <port>          The port to run the server on. Default is 4173.
  --open                 Open the browser. Default is true.
```

## Connect Studio

```
Command Overview:
  The connect command starts the Connect Studio, a development environment for building
  and testing Powerhouse applications. It provides a visual interface for working with 
  your project.

  This command:
  1. Starts a local Connect Studio server
  2. Provides a web interface for development
  3. Allows you to interact with your project components
  4. Supports various configuration options for customization

Options:
  -p, --port <port>      Port to run the server on. Default is 3000.
                       
  -h, --host             Expose the server to the network. By default, the server
                        only accepts connections from localhost.
                       
  --https                Enable HTTPS for secure connections. You may need to provide
                        certificate files for this option to work properly.
                       
  --open                 Automatically open the browser window after starting the server.
                       
  --config-file <path>   Path to the powerhouse.config.js file. This allows you to
                        customize the behavior of Connect Studio.

Examples:
  $ ph connect                                # Start Connect Studio on default port 3000
  $ ph connect -p 8080                        # Start on port 8080
  $ ph connect -h                             # Expose to network (not just localhost)
  $ ph connect --https                        # Enable HTTPS
  $ ph connect --open                         # Open browser automatically
  $ ph connect --config-file custom.config.js # Use custom configuration
  $ ph connect -p 8080 --open                 # Start on port 8080 and open browser
```

## Dev

```
Command Overview:
  The dev command sets up a development environment for working with Powerhouse projects.
  It starts a local development server with a Switchboard, enabling real-time document
  model editing and processing.

  This command:
  1. Starts a local development server
  2. Sets up a Switchboard for document processing
  3. Enables real-time updates and code generation
  4. Configures necessary services for development

Options:
  --generate               Generate code automatically when document models are updated.
                          This keeps your code in sync with model changes.
                        
  --switchboard-port <port> Specify the port to use for the Switchboard service.
                          The Switchboard handles document processing and communication.
                        
  --https-key-file <path>  Path to the SSL key file if using HTTPS for secure connections.
                        
  --https-cert-file <path> Path to the SSL certificate file if using HTTPS.
                        
  --config-file <path>     Path to the powerhouse.config.js file. This allows you to
                          customize the behavior of the development environment.
                        
  -w, --watch              Watch for local changes to document models and processors,
                          and automatically update the Switchboard accordingly.

Examples:
  $ ph dev                                           # Start dev environment with defaults
  $ ph dev --generate                                # Auto-generate code on model changes
  $ ph dev --switchboard-port 5000                   # Use custom port for Switchboard
  $ ph dev --config-file custom.powerhouse.config.js # Use custom configuration
  $ ph dev --watch                                   # Watch for changes and auto-update
  $ ph dev --https-key-file key.pem --https-cert-file cert.pem  # Use HTTPS
```

## Generate

```
Command Overview:
  The generate command creates code from document models. It helps you build editors, 
  processors, and other components based on your document model files.

  This command:
  1. Reads document model definitions
  2. Generates code for specified components (editors, processors, etc.)
  3. Supports customization of output and generation options
  4. Can watch files for changes and regenerate code automatically

Arguments:
  [document-model-file]  Optional. Path to the document model file to generate code from.
                        If not provided, the command will look for document models in
                        the default location.

Options:
  -i, --interactive      Run the command in interactive mode, which will guide you
                        through the generation process with prompts and options.
                        
  --editors <path>       Path to the directory where editors should be generated or found.
                        
  -e, --editor <name>    Name of the editor to generate or use.
                        
  --file <path>          Specific file path to the document model.
                        
  --processors <path>    Path to the directory where processors should be generated or found.
                        
  -p, --processor <name> Name of the processor to generate.
                        
  --processor-type <type> Type of processor to generate.
                        
  -s, --subgraph <name>  Name of the subgraph to use or create.
                        
  --document-models <path> Path to the document models directory.
                        
  --document-types <types> Document types supported by the editor, in the format
                        'namespace/type' (e.g., 'powerhouse/todo').
                        
  -is, --import-script <name> Name of the import script to generate.
                        
  -sf, --skip-format     Skip formatting the generated code.
                        
  -w, --watch            Watch for changes in the document model and regenerate code
                        when changes are detected.
                        
  -d, --drive-editor <name> Generate a drive editor with the specified name.

  --migration-file <path> Path to the migration file when running 'ph generate
    
  --schema-file <path> Path to the output file. Defaults to 'schema.ts' at the same directory of the migration file.

Examples:
  $ ph generate                                                     # Generate code using defaults
  $ ph generate my-document-model.zip                               # Generate from a specific model zip file
  $ ph generate -i                                                  # Run in interactive mode
  $ ph generate --editor ToDoList --document-types powerhouse/todo  # Generate a ToDoList editor for todo documents
  $ ph generate -p MyProcessor                                      # Generate a specific processor
  $ ph generate --watch                                             # Generate and watch for changes
  $ ph generate --drive-editor custom-drive-explorer                # Generate a custom drive editor
  $ ph generate -s MySubgraph                                       # Generate with a specific subgraph
  $ ph generate --skip-format                                       # Generate without formatting
  $ ph generate --migration-file ./migrations.ts                    # Generate types for an Operational Processor
```

## Inspect

```
Command Overview:
  The inspect command examines and provides detailed information about a Powerhouse package.
  It helps you understand the structure, dependencies, and configuration of packages in
  your project.

  This command:
  1. Analyzes the specified package
  2. Retrieves detailed information about its structure and configuration
  3. Displays package metadata, dependencies, and other relevant information
  4. Helps troubleshoot package-related issues

Arguments:
  <packageName>         Required. The name of the package to inspect. This should be
                        the name of a Powerhouse package or component.

Options:
  --debug               Show additional logs during the inspection process. This is
                        useful for troubleshooting or getting more detailed information
                        about how the inspection is performed.

Examples:
  $ ph inspect @powerhousedao/core                # Inspect the core package
  $ ph inspect @powerhousedao/document-model      # Inspect the document-model package
  $ ph inspect my-custom-component                # Inspect a custom component
  $ ph inspect @powerhousedao/editor --debug      # Inspect with detailed logs

Aliases:
  $ ph is                                    # Shorthand for inspect

Notes:
  - This command is useful for debugging and understanding package configurations
  - Information displayed includes package structure, dependencies, and metadata
  - The command requires the package to be installed in your project
```

## Install

```
Command Overview:
  The install command adds Powerhouse dependencies to your project. It handles installation
  of packages, updates configuration files, and ensures proper setup of dependencies.

  This command:
  1. Installs specified Powerhouse dependencies using your package manager
  2. Updates powerhouse.config.json to include the new dependencies
  3. Supports various installation options and configurations
  4. Works with npm, yarn, pnpm, and bun package managers

Arguments:
  [dependencies...]      Names of the dependencies to install. You can provide multiple
                        dependency names separated by spaces.

Options:
  -g, --global           Install the dependencies globally rather than in the current project.
                        
  --debug                Show additional logs during the installation process for troubleshooting.
                        
  -w, --workspace        Install the dependencies in the workspace (use this option for monorepos).
                        This ensures packages are installed with proper workspace configuration.
                        
  --package-manager <pm> Force a specific package manager to use. Supported values are:
                        "npm", "yarn", "pnpm", "bun". If not specified, the command will
                        detect the appropriate package manager from lockfiles.

Examples:
  $ ph install @powerhousedao/core                          # Install a single dependency
  $ ph install @powerhousedao/core @powerhousedao/utils     # Install multiple dependencies
  $ ph install @powerhousedao/cli -g                        # Install globally
  $ ph install @powerhousedao/document-model -w             # Install in workspace (monorepo)
  $ ph install @powerhousedao/core --package-manager yarn   # Force using yarn
  $ ph install @powerhousedao/editor --debug                # Show verbose logs during installation

Aliases:
  $ ph add                                   # Alias for install
  $ ph i                                     # Shorthand for install
```

## List

```
Command Overview:
  The list command displays information about installed Powerhouse packages in your project.
  It reads the powerhouse.config.json file and shows the packages that are currently installed.

  This command:
  1. Examines your project configuration
  2. Lists all installed Powerhouse packages
  3. Provides a clear overview of your project's dependencies
  4. Helps you manage and track your Powerhouse components

Options:
  --debug                Show additional logs during the listing process. This provides
                        more detailed information about the command execution and can
                        be helpful for troubleshooting.

Examples:
  $ ph list                                  # List all installed packages
  $ ph list --debug                          # List packages with detailed debug information

Aliases:
  $ ph l                                     # Shorthand for list

Notes:
  - The command reads from powerhouse.config.json in your project root
  - If no packages are found, the command will inform you that no packages are installed
  - Each package is displayed by its package name
```

## Reactor

```
Command Overview:
  The reactor command starts a local Switchboard instance,
  which acts as the document processing engine for Powerhouse projects. It provides
  the infrastructure for document models, processors, and real-time updates.

  This command:
  1. Starts a local reactor server
  2. Loads document models and processors
  3. Provides an API for document operations
  4. Supports real-time updates and code generation

Options:
  --port <PORT>           Port to host the API. Default is 4001.
                        
  --config-file <path>    Path to the powerhouse.config.js file. Default is 
                        './powerhouse.config.json'. This configures the reactor behavior.
                        
  --generate              Generate code automatically when document models are updated.
                        
  --db-path <DB_PATH>     Path to the database for storing document data.
                        
  --https-key-file <path> Path to the SSL key file if using HTTPS for secure connections.
                        
  --https-cert-file <path> Path to the SSL certificate file if using HTTPS.
                        
  -w, --watch             Watch for local changes to document models and processors,
                        and automatically update the reactor accordingly.
                        
  --packages <pkg...>     List of packages to be loaded. If defined, packages specified
                        in the config file are ignored.

Examples:
  $ ph reactor                           # Start reactor with default settings
  $ ph reactor --port 5000               # Use custom port 5000
  $ ph reactor --generate                # Enable auto code generation
  $ ph reactor --watch                   # Watch for local file changes
  $ ph reactor --config-file custom.json # Use custom configuration file
  $ ph reactor --packages pkg1 pkg2      # Load specific packages
```

## Service

```
Command Overview:
  The service command manages Powerhouse services, allowing you to start, stop, check status,
  and more. It provides a centralized way to control the lifecycle of services in your project.

  This command:
  1. Controls service lifecycle (start, stop, status, etc.)
  2. Manages multiple services from a single interface
  3. Provides detailed information about running services
  4. Uses PM2 under the hood for process management

Arguments:
  <action>              The action to perform. Available actions:
                        - start: Launch the specified service
                        - stop: Terminate the specified service
                        - status: Check the current status of services
                        - list: List all managed services (default)
                        - startup: Configure services to start on system boot
                        - unstartup: Remove services from system startup
                        
  [service]             Optional. The service to act upon. Available services:
                        - switchboard: The document processing engine
                        - connect: The Connect Studio interface
                        - all: Act on all services (default)

Examples:
  $ ph service setup                              # Setup services
  $ ph service start              # Start the services
  $ ph service stop                   # Stop the services
  $ ph service status                        # Check status of all services
  

Notes:
  - Services are managed using PM2, a process manager for Node.js applications
  - The 'status' action shows uptime, memory usage, CPU usage, and other metrics
  - The 'list' action is the default when no action is specified
  - The 'all' service is the default when no service is specified
```

## Switchboard

```
Command Overview:
  The switchboard command starts a local Switchboard instance, which acts as the document
  processing engine for Powerhouse projects. It provides the infrastructure for document
  models, processors, and real-time updates.

  This command:
  1. Starts a local switchboard server
  2. Loads document models and processors
  3. Provides an API for document operations
  4. Enables real-time document processing

Options:
  --port <PORT>           Port to host the API. Default is 4001.
                        
  --config-file <path>    Path to the powerhouse.config.js file. Default is 
                        './powerhouse.config.json'. This configures the switchboard behavior.
                        
  --db-path <DB_PATH>     Path to the database for storing document data.
                        
  --https-key-file <path> Path to the SSL key file if using HTTPS for secure connections.
                        
  --https-cert-file <path> Path to the SSL certificate file if using HTTPS.
                        
  --packages <pkg...>     List of packages to be loaded. If defined, packages specified
                        in the config file are ignored.
                        
  --base-path <path>      Base path for the API endpoints. Sets the BASE_PATH environment 
                        variable used by the server to prefix all routes.

Examples:
  $ ph switchboard                           # Start switchboard with default settings
  $ ph switchboard --port 5000               # Use custom port 5000
  $ ph switchboard --config-file custom.json # Use custom configuration file
  $ ph switchboard --packages pkg1 pkg2      # Load specific packages
  $ ph switchboard --base-path /switchboard  # Set API base path to /switchboard
```

## Uninstall

```
Command Overview:
  The uninstall command removes Powerhouse dependencies from your project. It handles the
  removal of packages, updates configuration files, and ensures proper cleanup.

  This command:
  1. Uninstalls specified Powerhouse dependencies using your package manager
  2. Updates powerhouse.config.json to remove the dependencies
  3. Supports various uninstallation options and configurations
  4. Works with npm, yarn, pnpm, and bun package managers

Arguments:
  [dependencies...]      Names of the dependencies to uninstall. You can provide multiple
                        dependency names separated by spaces.

Options:
  -g, --global           Uninstall the dependencies from the global installation
                        rather than from the current project.
                        
  --debug                Show additional logs during the uninstallation process
                        for troubleshooting and to trace the command execution.
                        
  -w, --workspace        Uninstall the dependencies from the workspace (use this option
                        for monorepos). This ensures packages are removed while
                        respecting workspace configurations.
                        
  --package-manager <pm> Force a specific package manager to use. Supported values are:
                        "npm", "yarn", "pnpm", "bun". If not specified, the command will
                        detect the appropriate package manager from lockfiles.

Examples:
  $ ph uninstall @powerhousedao/core                          # Uninstall a single dependency
  $ ph uninstall @powerhousedao/core @powerhousedao/utils     # Uninstall multiple dependencies
  $ ph uninstall @powerhousedao/cli -g                        # Uninstall globally
  $ ph uninstall @powerhousedao/document-model -w             # Uninstall from workspace (monorepo)
  $ ph uninstall @powerhousedao/core --package-manager yarn   # Force using yarn
  $ ph uninstall @powerhousedao/editor --debug                # Show verbose logs during uninstallation

Aliases:
  $ ph remove                                # Alias for uninstall
```

## Version

```
Command Overview:
  The version command displays the current version of the Powerhouse CLI tool.
  It helps you track which version you're using and ensure compatibility.

  This command:
  1. Retrieves version information from package.json
  2. Displays the version number of the CLI tool
  3. Can be used to verify successful installation or updates

Options:
  --debug                Show additional logs during version retrieval. This provides
                        more detailed information about how the version is determined,
                        which can be helpful for troubleshooting.

Examples:
  $ ph version                              # Display the CLI version
  $ ph version --debug                      # Show version with debug information

Aliases:
  $ ph v                                    # Shorthand for version

Notes:
  - The version follows semantic versioning (MAJOR.MINOR.PATCH)
  - Using the correct CLI version is important for compatibility with your project
  - Version information is read from the package.json file of the CLI
```

---

*This document was automatically generated from the help text in the codebase.*\n<!-- AUTO-GENERATED-CLI-COMMANDS-END -->