# Powerhouse Builder Tooling

This page provides an overview of all the builder tooling offered by the Powerhouse ecosystem.

## Powerhouse Command Line Interface
___

### Installing the Powerhouse CLI 
:::tip
The Powerhouse CLI tool is the only essential tool to install on this page.   
Once you've installed it with the command below you can continue to the next steps.
:::

The Powerhouse CLI (`ph-cmd`) is a command-line interface tool that provides essential commands for managing Powerhouse projects. You can get access to the Powerhouse ecosystem tools by installing them globally using:
```bash
pnpm install -g ph-cmd
``` 

Key commands include:
- `ph connect` for running the Connect application locally
- `ph switchboard` or `ph reactor` for starting the API service
- `ph init` to start a new project and build a Document Model
- `ph help` to get an overview of all the available commands

This tool will be fundamental on your journey when creating, building, and running Document Models

<details>
<summary> How to make use of different branches? </summary>

When installing or using the Powerhouse CLI commands you are able to make use of the dev & staging branches. These branches contain more experimental features then the latest stable release the PH CLI uses by default. They can be used to get access to a bugfix or features under development.

| Command | Description |
|---------|-------------|
| **pnpm install -g ph-cmd** | Install latest stable version |
| **pnpm install -g ph-cmd@dev** | Install development version |
| **pnpm install -g ph-cmd@staging** | Install staging version |
| **ph init** | Use latest stable version of the boilerplate |
| **ph init --dev** | Use development version of the boilerplate |
| **ph init --staging** | Use staging version of the boilerplate |
| **ph use** | Switch all dependencies to latest production versions |
| **ph use dev** | Switch all dependencies to development versions |
| **ph use prod** | Switch all dependencies to production versions |

Please be aware that these versions can contain bugs and experimental features that aren't fully tested.
</details>

<details>

<summary> How to clean your system of the Powerhouse CLI?</summary>

### Cleaning and Updating ph-cmd

If you need to perform a clean reinstallation of the Powerhouse CLI (`ph-cmd`), follow these steps:

1. First, uninstall the global ph-cmd package:
```bash
pnpm uninstall -g ph-cmd
```

2. Remove the Powerhouse configuration directory:
```bash
rm -rf ~/.ph
```

3. Reinstall the CLI tool (choose one):
```bash
# For the latest stable version
pnpm install -g ph-cmd

# For the staging version
pnpm install -g ph-cmd@staging

# For a specific version
pnpm install -g ph-cmd@<version>
```

This process ensures a clean slate by removing both the CLI tool and its configuration files before installing the desired version. It's particularly useful when:
- Troubleshooting CLI issues
- Upgrading to a new version
- Switching between stable and staging versions
- Resolving configuration conflicts 			

</details>

### The Use Command
The use command allows you to switch between different environments for your Powerhouse project dependencies.

```bash
ph use <environment> [localPath]
``` 
**Available Environments**
- latest - Uses the latest stable version of all Powerhouse packages.
- dev - Uses development versions of the packages.
- prod - Uses production versions of the packages.
- local - Uses local versions of the packages from a specified path.

**Examples**

#### Switch to latest stable versions
```bash
ph use latest
``` 

#### Switch to development versions
```bash
ph use dev
``` 

#### Use local versions from a specific path
```bash
ph use local /path/to/local/packages
``` 

#### Use a specific package manager
```bash
ph use latest --package-manager pnpm
``` 

### The Update Command
The update command allows you to update your Powerhouse dependencies to their latest versions based on the version ranges specified in your package.json.

```bash
ph update [options]
```

**Examples**
#### Update dependencies based on package.json ranges
```bash
ph update
```

#### Force update to latest dev versions
```bash
ph update --force dev
```

#### Force update to latest stable versions
```bash
ph update --force prod
```

#### Use a specific package manager
```bash
ph update --package-manager pnpm
```

## **Key Differences**

### **Use command**
- For switching between different **environments**.
- Requires you to specify an environment.
- Can work with **local packages**.

### **Update command**
- Updating **dependencies** within your current environment.
- Optional with its parameters.
- Focused on updating **remote package** versions.

Both commands support multiple package managers (npm, yarn, pnpm, and bun) and will automatically detect your project's package manager based on the lockfile present in your project directory.

## Boilerplate
___
The Document Model Boilerplate is a foundational template that is used for code generation when scaffolding your editors and models. It ensures compatibility with host applications like Connect and Switchboard for seamless Document Model and editor integration. 

After installing `ph-cmd`, you will run `ph init` to initialize a project directory and structure. This initialization command makes use of the boilerplate. 

The boilerplate includes essential commands with NPM/PNPM scripts for:
- Generating code
- Linting
- Formatting
- Building
- Testing

## Design System
___
The Powerhouse Design System is a collection of reusable front-end components based on GraphQL scalars, including custom scalars specific to the web3 ecosystem. It provides:
- Consistent UI components across Powerhouse applications
- Automatic inclusion as a dependency in new Document Model projects
- Customization options using CSS variables

Read more about the [design system here](/docs/academy/ComponentLibrary/PowerhouseDesignSystem)

## Reactor Libraries
___
Reactors are the nodes in the Powerhouse network that handle document storage, conflict resolution, and operation verification. 
The Reactor Libraries include:

### API
- **Subgraphs**: Modular GraphQL services that connect to the Reactor for structured data access
- **Processors**: Event-driven components that react to document changes and process data

### Browser
Handles client-side interactions

### Local
Manages local storage and offline functionality

### Drive App
Handles document organization and storage management, but can also be customized to offer specific functionality, categorization, or tailored interfaces for your documents. 

## Code Generators
___
Powerhouse provides several code generation tools to streamline development:

    ### Document Model Scaffolding
    Generates the basic structure for new Document Models with the command `ph init` based on the boilerplate. 

    ### Editor Generator
    Creates template code for Document Model editors with the command `ph generate --editor <name> --document-types <documenttype>`

    ### Drive Editor Generator
    Builds scaffolding for custom Drive interfaces with the command `ph generate --drive-editor <name>`

    ### Subgraph Generator
    Creates GraphQL subgraph templates for data access automatically upon `ph reactor`

    ### Processor Generator
    Generates processor templates for event handling automatically upon `ph reactor`

    ### Analytics Processor Generator
    Creates specialized processors for analytics tracking

## Analytics Engine
___
The Analytics Engine is a system that allows tracking and analyzing operations and state changes on Document Models. Features include:
- Custom dashboard and report generation
- Document Model-specific analytics
- Metric and dimension tracking
- Data combination from multiple Document Models

Generate an analytics processor using:
```bash
ph generate --processor-type analytics
```