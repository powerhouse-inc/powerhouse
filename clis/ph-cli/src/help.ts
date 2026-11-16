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
                        
  -d, --document <path>  Path to a document model spec (.phd or .json) to generate from.
                        
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
                        
  -d, --app <name> Generate an app with the specified name.

  --migration-file <path> Path to the migration file when running 'ph generate
    
  --schema-file <path> Path to the output file. Defaults to 'schema.ts' at the same directory of the migration file.

Examples:
  $ ph generate                                                     # Generate code using defaults
  $ ph generate my-document-model.zip                               # Generate from a specific model zip file
  $ ph generate -i                                                  # Run in interactive mode
  $ ph generate --editor ToDoList --document-types powerhouse/todo  # Generate a ToDoList editor for todo documents
  $ ph generate -p MyProcessor --processor-type relationalDb        # Generate a specific processor
  $ ph generate --watch                                             # Generate and watch for changes
  $ ph generate --app custom-drive-explorer                # Generate a custom app
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
