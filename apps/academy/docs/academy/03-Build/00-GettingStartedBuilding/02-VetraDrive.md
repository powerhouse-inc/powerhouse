---
toc_max_heading_level: 3
---

# Vetra Drive

## Introducing Vetra Drive for Builders

Vetra Studio is the builder environment where you create, manage, and collaborate on Powerhouse packages. It consists of two main components:

- **Vetra Studio Drive**: Serves as a hub for developers to access, manage & share specifications through a remote Vetra drive. It functions as the orchestration hub where you as a builder assemble all the necessary specifications for your intended use-case, software solution, or package. Each specification document corresponds to a **module** — a distinct building block of your package (such as a document model, editor, or data integration).
- **Vetra Package Library**: Store, publish, and fork git repositories of packages in the Vetra Package Library.  
  Visit the [Vetra Package Library here](https://vetra.io/packages)

:::info
What is a Specification Document?
A **specification document** is a configuration file that defines how a specific module in your package should behave. Think of it as a blueprint: it describes the structure, rules, and relationships that Powerhouse uses to generate the actual code for that module. Specification documents make **Specification-Driven Design & Development** possible: you communicate your solution and intent through a structured framework designed for AI collaboration. Specs are a shared language that enables precise, iterative edits.
:::

As Vetra Studio matures, each of these specification documents will offer an interface by which you as a builder get more control over the modules that make up your package.
For now, the specification documents offer you a template for code generation.

<figure className="image-container">
  <img
    src={require("./images/Modules.png").default}
    alt="Modules"
  />
  <figcaption>The list of available modules color coded according to the 3 categories.</figcaption>
</figure>

### Module Categories

### 1. Document Models

A **document model** is a structured data type that defines what information your application can store and how it can be modified. Unlike traditional databases, document models use **operations** (actions like "add item" or "update title") rather than direct data manipulation, making them ideal for collaborative and auditable applications.

- **Document model specification**: Defines the structure and operations of a document model using [GraphQL SDL](https://graphql.org/learn/schema/) (Schema Definition Language), ensuring consistent data management and processing.

→ [Learn more about Document Models](/academy/Build/DocumentModelCreation/WhatIsADocumentModel)

### 2. User Experiences

- **Editor specification**: Outlines the interface and functionalities of a document model editor, allowing users to interact with and modify document data.
- **Drive-app specification**: Specifies the UI and interactions for managing documents within a drive, providing tailored views and functionalities.

→ [Learn more about Building Document Editors](/academy/Build/BuildingUserExperiences/BuildingDocumentEditors)
→ [Learn more about Building a Drive Explorer](/academy/Build/BuildingUserExperiences/BuildingADriveExplorer)

### 3. Data Integrations

- **Subgraph specification**: Details the connections and relationships within a subgraph (a subset of your data exposed via a GraphQL API), facilitating efficient data querying and manipulation.
- **Codegen Processor Specification**: Describes the process for automatically generating code from document model specifications, ensuring alignment with intended architecture.
- **RelationalDb Processor Specification**: Defines how relational databases are structured and queried, supporting efficient data management and retrieval.

→ [Learn more about Using Subgraphs](/academy/Build/WorkWithData/UsingSubgraphs)
→ [Learn more about Relational DB Processor](/academy/Build/WorkWithData/RelationalDbProcessor)

<figure className="image-container">
  <img
    src={require("./images/VetraStudioDrive.png").default}
    alt="Vetra Studio Drive"
  />
  <figcaption>The Vetra Studio Drive, a builder app that collects all of the specifications of a package.</figcaption>
</figure>

### Configure a Vetra Drive in Your Project

You can connect to a remote Vetra drive instead of using the local one auto-generated when you run `ph vetra` (where `ph` is short for "powerhouse", the CLI tool and the Organization behind Vetra).

- **Without** the `--remote-drive` option: Vetra will create a local drive for you that lives in your browser's local storage. This is useful for solo development or experimentation.
- **With** the `--remote-drive` argument: Vetra will connect to a remote drive instead of creating a local one. The remote drive can be hosted wherever you want (e.g., on your own server or a shared team environment).

The Powerhouse config includes a Vetra URL for consistent project configuration across different environments.

```typescript
vetra: {
  driveId: string;
  driveUrl: string;
}
```

Imagine you are a builder and want to work on, or continue with a set of specifications from your teammates.
You could then add the specific remote Vetra drive to your Powerhouse configuration in the `powerhouse.config.json` file to get going:

```json
"vetra": {
    "driveId": "bai-specifications",
    "driveUrl": "https://switchboard.staging.vetra.io/d/bai-specifications"
  }
```

An example of a builder team building on the Powerhouse Vetra Ecosystem and its complementary Vetra Studio Drive specifications for the different packages can be found [here](https://vetra.io/builders/bai).

### Connect Claude to the Reactor MCP

Claude can connect directly to your running Reactor via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/), giving it live access to your drives, documents, and document model operations.

Add the following configuration to your Claude MCP settings (e.g. `~/.claude/mcp.json` for Claude Code, or the MCP servers section in Claude Desktop):

```json
{
  "mcpServers": {
    "reactor-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:4001/mcp"]
    }
  }
}
```

This connects Claude to the Reactor running at `http://localhost:4001`. Make sure `ph vetra --watch` (or `ph reactor`) is running before starting a Claude session that uses the MCP.

→ See [Connecting Claude with Reactor MCP](/academy/Lookup/Cookbook#connecting-claude-with-reactor-mcp) for a step-by-step walkthrough.

<details>
<summary>📦 Vetra Remote Drive Commands</summary>

Remote drives enable collaborative development by syncing specifications across team members.

**Key Commands:**

- `ph init --remote-drive <url>` - Create or connect to a project using a remote drive
- `ph vetra --watch` - Start development with a preview drive for testing local changes

**Workflows:**

- **Project Owner**: `ph init --remote-drive` → Create GitHub repo → Push → `ph vetra --watch` to configure
- **Collaborator**: `ph init --remote-drive <url>` → `ph vetra --watch` to start developing

**Preview Drive (`--watch` mode):**

The preview drive allows you to safely test changes before they affect the shared remote drive.

- The main **"Vetra" drive** syncs with the remote and contains the stable package configuration.
- The **"Vetra Preview" drive** is created locally for testing document models and editors before syncing your changes to the team.
- When restarting Vetra, always use `ph vetra --watch` so it loads your local documents and editors.

→ [Full Vetra Remote Drive Reference](/academy/Reference/CLITooling/VetraRemoteDrive)

</details>
