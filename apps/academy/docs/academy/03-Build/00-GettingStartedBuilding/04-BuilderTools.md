# Vetra builder tooling

An overview of the builder tooling in the Powerhouse/Vetra ecosystem, for the manual (CLI) builder workflow. This list grows as the toolkit does.

## Powerhouse CLI

The Powerhouse CLI (`ph-cmd`) is the command-line entry point for building by hand: scaffolding projects, generating code, and running Connect and the Reactor locally.

- Install it and verify your setup in [Prerequisites](/academy/Build/GettingStartedBuilding/Prerequisites).
- For the full command list — `ph init`, `ph use`, `ph update`, `ph generate`, and the rest — see the [Powerhouse CLI reference](/academy/Reference/CLITooling/PowerhouseCLI).
- For task-oriented walkthroughs (switching versions, managing dependencies, publishing), see the [Cookbook](/academy/Lookup/Cookbook).

## Boilerplate

The Document Model boilerplate is the foundational template used for code generation when scaffolding your editors and models. It ensures compatibility with host applications like Connect and Switchboard for document model and editor integration.

After installing `ph-cmd`, run `ph init` to initialize a project directory and structure; this command uses the boilerplate. The boilerplate includes scripts for generating code, linting, formatting, building, and testing.

## Design system

The Powerhouse Design System is a collection of reusable front-end components based on GraphQL scalars, including custom scalars specific to the web3 ecosystem. It provides:

- Consistent UI components across Powerhouse applications
- Automatic inclusion as a dependency in new document model projects
- Customization options using CSS variables

Read more in the [Component Library documentation](/academy/Reference/EditorsUI/DocumentEngineering).

## Reactor libraries

Reactors are the nodes in the Powerhouse network that handle document storage, conflict resolution, and operation verification. The Reactor libraries include:

- **API** — **Subgraphs** (modular GraphQL services that connect to the Reactor for structured data access) and **Processors** (event-driven components that react to document changes and process data).
- **Browser** — handles client-side interactions.
- **Local** — manages local storage and offline functionality.
- **drive-app** — handles document organization and storage management, and can be customized to offer specific functionality, categorization, or tailored interfaces for your documents.

## Code generators

Powerhouse provides several code generation tools:

### Document model scaffolding

Generates the basic structure for new document models with `ph init`, based on the boilerplate.

### Editor generator

Creates template code for document model editors: `ph generate editor --name <name> --document-type <documenttype>`.

### Subgraph generator

Creates GraphQL subgraph templates for data access automatically on `ph reactor`.

### Processor generator

Generates processor templates for event handling automatically on `ph reactor`.

### Analytics processor generator

Creates specialized processors for analytics tracking.

## Analytics engine

The Analytics Engine tracks and analyzes operations and state changes on document models. Features include:

- Custom dashboard and report generation
- Document-model-specific analytics
- Metric and dimension tracking
- Data combination from multiple document models

Generate an analytics processor with:

```bash
ph generate processor --type analytics
```
