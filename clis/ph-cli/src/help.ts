import {
  DEFAULT_ASSETS_DIR_NAME,
  DEFAULT_EXTERNAL_PACKAGES_FILE_NAME,
  DEFAULT_STYLES_FILE_NAME,
} from "@powerhousedao/builder-tools/connect-build";

/**
 * Help text for the connect studio command
 */
export const connectStudioHelp = `
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
`;

/**
 * Help text for the connect build command
 */
export const connectBuildHelp = `
Command Overview:
  The Connect build command creates a connect build with the project's local and external packages included.

Options:
  --base <path> The base path for the app. Default is "/".
  --project-root <path>  The root directory of the project. Default is "process.cwd()".
  --assets-dir-name <name> The name of the assets directory. Default is "${DEFAULT_ASSETS_DIR_NAME}".
  --external-packages-file-name <name> The name of the external packages file. Default is "${DEFAULT_EXTERNAL_PACKAGES_FILE_NAME}".
  --styles-file-name <name> The name of the styles file. Default is "${DEFAULT_STYLES_FILE_NAME}".
  --connect-path <path>  The path to the Connect dist directory. Calls "resolveConnect()" if not provided.
`;

/**
 * Help text for the connect preview command
 */
export const connectPreviewHelp = `
Command Overview:
  The Connect preview command previews a built Connect project.
  NOTE: You must run \`ph connect build\` first.

Options:
  --base <path>          The base path for the app. Default is "/".
  --project-root <path>  The root directory of the project. Default is "process.cwd()".
  --port <port>          The port to run the server on. Default is 4173.
  --open                 Open the browser. Default is true.
`;

/**
 * Help text for the generate command
 */
export const generateHelp = `
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
`;

/**
 * Help text for the install command
 */
export const installHelp = `
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
`;

/**
 * Help text for the uninstall command
 */
export const uninstallHelp = `
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
`;

/**
 * Help text for the list command
 */
export const listHelp = `
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
`;

/**
 * Help text for the dev command
 */
export const devHelp = `
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
`;

/**
 * Help text for the inspect command
 */
export const inspectHelp = `
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
`;

/**
 * Help text for the service command
 */
export const serviceHelp = `
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
`;

/**
 * Help text for the switchboard command
 */
export const switchboardHelp = `
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
`;

/**
 * Help text for the reactor command
 */
export const reactorHelp = `
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
`;

/**
 * Help text for the version command
 */
export const versionHelp = `
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
`;
