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
  --port <port>               Port to run the server on. Default is 3000.

  --host                      Expose the server to the network. By default, the server
                              only accepts connections from localhost.

  --open                      Automatically open the browser window after starting the server.

  --cors                      Enable CORS (Cross-Origin Resource Sharing).

  --strictPort                Exit if specified port is already in use.

  --force                     Force the optimizer to ignore the cache and re-bundle.

  --mode <mode>               Vite mode to use (e.g., development, production).

  --config-file <configFile>  Path to the powerhouse.config.js file. This allows you to
                              customize the behavior of Connect Studio.

  --vite-config-file <file>   Path to the vite config file.

  --project-root <path>       The root directory of the project. Default is current directory.

Examples:
  $ ph connect                                 # Start Connect Studio on default port 3000
  $ ph connect --port 8080                     # Start on port 8080
  $ ph connect --host                          # Expose to network (not just localhost)
  $ ph connect --open                          # Open browser automatically
  $ ph connect --cors                          # Enable CORS
  $ ph connect --strictPort                    # Exit if port is in use
  $ ph connect --force                         # Force re-bundle
  $ ph connect --mode production               # Use production mode
  $ ph connect --config-file custom.config.js  # Use custom configuration
  $ ph connect --vite-config-file vite.config.js # Use custom vite config
  $ ph connect --project-root /path/to/project # Set project root
  $ ph connect --port 8080 --open              # Start on port 8080 and open browser
`;

/**
 * Help text for the connect build command
 */
export const connectBuildHelp = `
Command Overview:
  The Connect build command creates a production build with the project's local and
  external packages included.

Options:
  --outDir <outDir>           Output directory. Defaults to 'dist'.

  --base <base>               Base path for the app. Default is "/".

  --mode <mode>               Vite mode to use (e.g., development, production).

  --config-file <configFile>  Path to the powerhouse.config.js file.

  --vite-config-file <file>   Path to the vite config file.

  --project-root <path>       The root directory of the project. Default is current directory.

Examples:
  $ ph connect build                              # Build with defaults
  $ ph connect build --outDir build               # Output to 'build' directory
  $ ph connect build --base /app                  # Set base path to '/app'
  $ ph connect build --mode production            # Use production mode
  $ ph connect build --config-file custom.config.js # Use custom configuration
  $ ph connect build --vite-config-file vite.config.js # Use custom vite config
  $ ph connect build --project-root /path/to/project # Set project root
`;

/**
 * Help text for the connect preview command
 */
export const connectPreviewHelp = `
Command Overview:
  The Connect preview command previews a built Connect project.
  NOTE: You must run \`ph connect build\` first.

Options:
  --outDir <outDir>           Output directory. Defaults to 'dist'.

  --port <port>               Port to run the server on. Default is 3000.

  --host                      Expose the server to the network.

  --open                      Open browser on startup.

  --strictPort                Exit if specified port is already in use.

  --base <base>               Base path for the app. Default is "/".

  --mode <mode>               Vite mode to use (e.g., development, production).

  --config-file <configFile>  Path to the powerhouse.config.js file.

  --vite-config-file <file>   Path to the vite config file.

  --project-root <path>       The root directory of the project. Default is current directory.

Examples:
  $ ph connect preview                            # Preview with defaults
  $ ph connect preview --outDir build             # Preview from 'build' directory
  $ ph connect preview --port 8080                # Preview on port 8080
  $ ph connect preview --host                     # Expose to network
  $ ph connect preview --open                     # Open browser automatically
  $ ph connect preview --strictPort               # Exit if port is in use
  $ ph connect preview --base /app                # Set base path to '/app'
  $ ph connect preview --mode production          # Use production mode
  $ ph connect preview --config-file custom.config.js # Use custom configuration
  $ ph connect preview --vite-config-file vite.config.js # Use custom vite config
  $ ph connect preview --project-root /path/to/project # Set project root
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
                        
  --processor-type <type> Type of processor to generate. 'relationalDb' or 'analytics'
                        
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
  $ ph generate -p MyProcessor --processor-type relationalDb        # Generate a specific processor
  $ ph generate --watch                                             # Generate and watch for changes
  $ ph generate --drive-editor custom-drive-explorer                # Generate a custom drive editor
  $ ph generate -s MySubgraph                                       # Generate with a specific subgraph
  $ ph generate --skip-format                                       # Generate without formatting
  $ ph generate --migration-file ./migrations.ts                    # Generate types for an RelationalDB Processor
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
 * Help text for the vetra command
 */
export const vetraHelp = `
Command Overview:
  The vetra command sets up a Vetra development environment for working with Vetra projects.
  It starts a Vetra Switchboard and optionally Connect Studio, enabling document collaboration 
  and real-time processing with a "Vetra" drive or connection to remote drives.

  This command:
  1. Starts a Vetra Switchboard with a "Vetra" drive for document storage
  2. Optionally connects to remote drives instead of creating a local drive
  3. Starts Connect Studio pointing to the Switchboard for user interaction (unless disabled)
  4. Enables real-time updates, collaboration, and code generation

Options:
  --logs                     Enable verbose logging for all services. This provides detailed
                            output from Switchboard and Connect during startup and operation.
                        
  --switchboard-port <port>  Specify the port to use for the Vetra Switchboard service.
                            Default is 4001. The Switchboard handles document storage.
                        
  --connect-port <port>      Specify the port to use for Connect Studio.
                            Default is 3000. Connect provides the user interface.
                        
  --https-key-file <path>    Path to the SSL key file if using HTTPS for secure connections.
                        
  --https-cert-file <path>   Path to the SSL certificate file if using HTTPS.
                        
  --config-file <path>       Path to the powerhouse.config.js file. This allows you to
                            customize the behavior of the Vetra development environment.
                        
  -w, --watch                Enable dynamic loading for document-models and editors in
                            connect-studio and switchboard. When enabled, the system will
                            watch for changes in these directories and reload them dynamically.
                        
  --remote-drive <url>       URL of remote drive to connect to. When specified, the switchboard
                            connects to this remote drive instead of creating a local Vetra drive.
                        
  --disable-connect          Skip Connect initialization (only start switchboard and reactor).
                            Use this when you only need the backend services running.
                        
  --interactive              Enable interactive mode for code generation. When enabled, the system
                            will prompt for user confirmation before generating code. This is useful
                            for development when you want control over when code regeneration happens.

Examples:
  $ ph vetra                                              # Start Vetra environment with defaults
  $ ph vetra --switchboard-port 5000 --connect-port 3001 # Use custom ports
  $ ph vetra --config-file custom.powerhouse.config.js   # Use custom configuration
  $ ph vetra --watch                                      # Enable dynamic loading for development
  $ ph vetra -w                                           # Enable dynamic loading (short form)
  $ ph vetra --logs                                       # Enable detailed logging
  $ ph vetra --remote-drive http://localhost:4001/d/docs  # Connect to remote drive
  $ ph vetra --disable-connect                            # Start only backend services
  $ ph vetra --interactive                                # Enable interactive code generation mode
  $ ph vetra --https-key-file key.pem --https-cert-file cert.pem  # Use HTTPS
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
  5. Can authenticate with remote services using your identity from 'ph login'

Options:
  --port <PORT>           Port to host the API. Default is 4001.

  --config-file <path>    Path to the powerhouse.config.js file. Default is
                        './powerhouse.config.json'. This configures the switchboard behavior.

  --dev                   Enable development mode to load local packages from the current directory.
                        This allows the switchboard to discover and load document models, processors,
                        and subgraphs from your local development environment.

  --db-path <DB_PATH>     Path to the database for storing document data.

  --https-key-file <path> Path to the SSL key file if using HTTPS for secure connections.

  --https-cert-file <path> Path to the SSL certificate file if using HTTPS.

  --packages <pkg...>     List of packages to be loaded. If defined, packages specified
                        in the config file are ignored.

  --base-path <path>      Base path for the API endpoints. Sets the BASE_PATH environment
                        variable used by the server to prefix all routes.

Identity Options:
  --use-identity          Enable identity using the keypair from 'ph login'. This allows the
                        switchboard to authenticate with remote drives and services using
                        your authorized Ethereum identity.

  --keypair-path <path>   Path to a custom keypair file. Overrides the default .ph/.keypair.json
                        in the current directory.

  --require-identity      Require an existing keypair; fail if not found. Use this when you
                        want to ensure the switchboard runs with a valid identity. If no
                        keypair exists, run 'ph login' first to create one.

Migration Options:
  --migrate               Run database migrations and exit without starting the server.
                        Useful for CI/CD pipelines or manual migration control.
                        Only works with PostgreSQL databases.

  --migrate-status        Show current migration status and exit. Lists all migrations
                        and indicates which have been applied.

Examples:
  $ ph switchboard                           # Start switchboard with default settings
  $ ph switchboard --port 5000               # Use custom port 5000
  $ ph switchboard --dev                     # Enable dev mode to load local packages
  $ ph switchboard --config-file custom.json # Use custom configuration file
  $ ph switchboard --packages pkg1 pkg2      # Load specific packages
  $ ph switchboard --base-path /switchboard  # Set API base path to /switchboard
  $ ph switchboard --use-identity            # Start with identity from ph login
  $ ph switchboard --require-identity        # Require identity, fail if not logged in
  $ ph switchboard --migrate                 # Run migrations and exit
  $ ph switchboard --migrate-status          # Check migration status
  $ ph switchboard --db-path postgresql://... --migrate  # Migrate specific database
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

/**
 * Help text for the login command
 */
export const loginHelp = `
Command Overview:
  The login command authenticates you with Renown using your Ethereum wallet. This enables
  the CLI to act on behalf of your Ethereum identity for authenticated operations.

  This command:
  1. Generates or loads a cryptographic identity (DID) for the CLI
  2. Opens your browser to the Renown authentication page
  3. You authorize the CLI's DID to act on behalf of your Ethereum address
  4. Stores the credentials locally in .ph/.renown.json

Options:
  --renown-url <url>    Specify a custom Renown server URL. Defaults to
                        https://www.renown.id

  --timeout <seconds>   Set the authentication timeout in seconds. The command will
                        wait this long for you to complete authentication in the browser.
                        Defaults to 300 seconds (5 minutes).

  --logout              Sign out and clear your stored credentials. Use this when you
                        want to switch accounts or revoke local authentication.

  --status              Show your current authentication status without logging in.
                        Displays your CLI DID, ETH address, and when you authenticated.

  --show-did            Show only the CLI's DID and exit. Useful for scripts.

Authentication Flow:
  1. Run 'ph login' - the CLI generates/loads its cryptographic identity (DID)
  2. A browser window opens to Renown with the CLI's DID
  3. Connect your Ethereum wallet (MetaMask, etc.)
  4. Authorize the CLI's DID to act on behalf of your ETH address
  5. Return to your terminal - authentication is complete!

Credentials Storage:
  All identity files are stored per-project in the current working directory:

  .ph/.keypair.json   The CLI's cryptographic keypair (ECDSA P-256)
  .ph/.renown.json      Your Renown authentication credentials including:
                  - Your Ethereum address (the account you authorized)
                  - Your User DID (did:pkh:eip155:chainId:address)
                  - CLI DID (did:key:... - the CLI's cryptographic identity)
                  - Credential ID for session validation

  This allows each project to have its own identity and credentials.
  For CI/CD, provide the keypair via PH_RENOWN_PRIVATE_KEY env variable.

Environment Variables:
  PH_RENOWN_PRIVATE_KEY   JSON-encoded JWK keypair for the CLI's identity.
                          If set, the CLI will use this instead of generating
                          or loading from file. Useful for CI/CD environments.

Examples:
  $ ph login                              # Authenticate with default settings
  $ ph login --status                     # Check authentication status and CLI DID
  $ ph login --show-did                   # Print only the CLI's DID
  $ ph login --logout                     # Sign out and clear credentials
  $ ph login --timeout 600                # Wait up to 10 minutes for authentication
  $ ph login --renown-url http://localhost:3000   # Use local Renown server

Notes:
  - You only need to authenticate once; credentials persist until you log out
  - The CLI's DID remains stable unless you delete .ph/.keypair.json from your project
  - If already authenticated, the command will show your current status
  - The browser must remain open until authentication completes
  - Your wallet signature authorizes the CLI's DID to act on your behalf
`;

/**
 * Help text for the access-token command
 */
export const accessTokenHelp = `
Command Overview:
  The access-token command generates a bearer token for API authentication. This token
  can be used to authenticate requests to Powerhouse APIs like reactor-api (Switchboard).

  This command:
  1. Uses your CLI's cryptographic identity (DID) to sign a verifiable credential
  2. Creates a JWT bearer token with configurable expiration
  3. Outputs the token to stdout (info to stderr) for easy piping

Prerequisites:
  You must have a cryptographic identity. Run 'ph login' first to:
  - Generate a keypair (stored in .ph/.keypair.json)
  - Optionally link your Ethereum address (stored in .ph/.renown.json)

Options:
  --expiry <duration>     Set the token expiration time. Supports multiple formats:
                          - Days: "7d" (default), "30d", "1d"
                          - Hours: "24h", "12h", "1h"
                          - Seconds: "3600", "3600s", "86400s"
                          Default is 7 days.

  --audience <url>        Optional. Set the intended audience (aud claim) for the token.
                          This can be used to restrict the token to specific services.

Token Details:
  The generated token is a JWT (JSON Web Token) containing:
  - Issuer (iss): Your CLI's DID (did:key:...)
  - Subject (sub): Your CLI's DID
  - Credential Subject: Chain ID, network ID, and address (if authenticated)
  - Expiration (exp): Based on --expiry option
  - Audience (aud): If --audience is specified

Output:
  - Token information (DID, address, expiry) is printed to stderr
  - The token itself is printed to stdout for easy piping/copying

  This allows you to use the command in scripts:
    TOKEN=$(ph access-token)
    curl -H "Authorization: Bearer $TOKEN" http://localhost:4001/graphql

Examples:
  $ ph access-token                          # Generate token valid for 7 days
  $ ph access-token --expiry 30d             # Generate token valid for 30 days
  $ ph access-token --expiry 24h             # Generate token valid for 24 hours
  $ ph access-token --expiry 3600            # Generate token valid for 1 hour (3600 seconds)
  $ ph access-token --audience http://localhost:4001  # Set audience claim
  $ ph access-token | pbcopy                 # Copy token to clipboard (macOS)
  $ ph access-token | xclip -selection c     # Copy token to clipboard (Linux)

Usage with APIs:
  # Generate token and use with curl
  TOKEN=$(ph access-token --expiry 1d)
  curl -X POST http://localhost:4001/graphql \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer $TOKEN" \\
    -d '{"query": "{ drives { id name } }"}'

  # Export as environment variable
  export PH_ACCESS_TOKEN=$(ph access-token)

Notes:
  - Tokens are self-signed using your CLI's private key
  - No network request is made; tokens are generated locally
  - The recipient API must trust your CLI's DID to accept the token
  - For reactor-api, ensure AUTH_ENABLED=true to require authentication
`;
