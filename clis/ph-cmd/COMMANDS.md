# Powerhouse CLI Commands

This document provides detailed information about the available commands in the Powerhouse CLI.

## Table of Contents

- [Init](#init)
- [Setup Globals](#setup-globals)
- [Update](#update)
- [Use](#use)

## Init

```
Command Overview:
  The init command creates a new Powerhouse project with optimal defaults. It sets up a fully 
  configured project structure with all necessary dependencies, configurations, and boilerplate.   

  This command:
  1. Creates a new project with the specified name.
  2. Installs all required dependencies for Powerhouse development.
  3. Sets up a proper project structure and configuration files.
  4. Can run in interactive mode for customized setup.

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
  - Proper configuration files for TypeScript and ESLint.
  - Dependencies for Powerhouse packages.
  - Build and development scripts.

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

*This document was automatically generated from the help text in the codebase.*
