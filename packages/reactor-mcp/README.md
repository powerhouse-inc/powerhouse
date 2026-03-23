# @powerhousedao/reactor-mcp

MCP (Model Context Protocol) server for document model operations in the Powerhouse ecosystem. This package enables AI agents to interact with Powerhouse documents, drives, and document models through a standardized protocol.

## Installation

### Claude Desktop (Recommended for GUI Users)

Claude Desktop requires a URL-based connector setup:

1. Open Claude Desktop and go to **Settings** (gear icon)
2. Navigate to **Connectors** in the left sidebar
3. Click **Add custom connector** at the bottom
4. Enter the following details:
   - **Name**: `reactor-mcp`
   - **URL**: Your reactor MCP endpoint (e.g., `https://switchboard.powerhouse.xyz/mcp` for production)
5. Click **Add** to connect

> **Note**: The npx-based JSON configuration does NOT work for Claude Desktop. You must use the URL-based connector approach described above.

Claude Desktop is ideal for **document users** who want to interact with existing document models - creating documents, populating data, parsing files (like invoices from PDFs), and managing drives. It connects to a remote reactor where document models are already deployed.

### Claude Code CLI (For Developers)

Claude Code CLI is for **developers** building document models, editors, and other Powerhouse components. When running Vetra Studio, a `.mcp.json` file is created in your project directory that configures the MCP connection.

1. Start Vetra Studio in your project:
   ```bash
   ph vetra --interactive --watch
   ```

2. Vetra creates a `.mcp.json` file with the local MCP configuration:
   ```json
   {
     "mcpServers": {
       "reactor-mcp": {
         "type": "http",
         "url": "http://localhost:4001/mcp"
       }
     }
   }
   ```

3. In a separate terminal, start Claude Code CLI from your project directory:
   ```bash
   claude
   ```

4. Claude Code reads the `.mcp.json` file and connects to the reactor-mcp server.

### Local Development with Vetra Studio

For local development, reactor-mcp runs as part of Vetra Studio:

```bash
# Start Vetra Studio with the reactor
ph vetra --interactive --watch
```

The MCP server will be available at `http://localhost:4001/mcp` when Vetra is running.

## Available Tools

The reactor-mcp server provides 12 tools organized into three categories:

### Document Operations

| Tool | Description |
|------|-------------|
| `createDocument` | Create a new document of a specified type |
| `getDocument` | Retrieve a document by its ID |
| `getDocuments` | List all documents in a drive |
| `deleteDocument` | Delete a document |
| `addActions` | Add actions (operations) to modify document state |

### Drive Operations

| Tool | Description |
|------|-------------|
| `getDrives` | List all available drives |
| `addDrive` | Create a new drive |
| `getDrive` | Get details of a specific drive |
| `deleteDrive` | Delete a drive |
| `addRemoteDrive` | Connect to a remote drive |

### Document Model Operations

| Tool | Description |
|------|-------------|
| `getDocumentModels` | List all available document model types |
| `getDocumentModelSchema` | Get the schema definition for a document model |

## Key Concepts

Understanding these concepts helps when working with reactor-mcp:

- **Document Model**: A schema that defines the structure and operations for a type of document. Think of it as a template or blueprint.
- **Document**: An instance of a document model containing actual data.
- **Drive**: A container that holds documents, similar to a folder.
- **Action**: A user intent that triggers state changes (e.g., "add item", "update status").
- **Operation**: The recorded result of applying an action, stored in the document's history.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REACTOR_PORT` | Port for the reactor server | `4001` |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |

## Claude Desktop vs Claude Code CLI

| Feature | Claude Desktop | Claude Code CLI |
|---------|---------------|-----------------|
| Target users | Document users | Developers |
| Setup method | URL-based connector (GUI) | `.mcp.json` file in project |
| Configuration | Settings → Connectors | Created by `ph vetra` |
| Connection | Remote reactor | Local reactor at `http://localhost:4001/mcp` |
| Use cases | Create documents, populate data, parse files (e.g., PDF → invoice), manage drives | Build document models, create editors, write code |
