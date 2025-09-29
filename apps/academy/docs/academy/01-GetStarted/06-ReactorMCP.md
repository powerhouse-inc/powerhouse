# Tool: Reactor MCP

**Reactor-mcp** is a Model Context Protocol (MCP) server for the Powerhouse ecosystem that provides AI agents and tools with structured access to document model operations. 
It serves as a bridge between AI systems and the Powerhouse document management infrastructure.

## Main Functions of the Reactor-mcp

**Document Operations**:
- createDocument - Create new documents
- getDocument - Retrieve documents by ID
- addActions - Add actions to modify document state
- deleteDocument - Remove documents

**Drive Operations**:
- getDrives - List all document drives
- addDrive - Create new drives
- getDrive - Retrieve specific drives
- addRemoteDrive - Connect to remote drives

**Document Model Operations**:
- getDocumentModels - List available document model types
- getDocumentModelSchema - Get schema for specific document models

<details>
<summary>Architecture Context</summary>

Within the broader Powerhouse ecosystem:

- Document Model: Defines structure and operations for document types
- Document Drive: Manages collections of documents with sync capabilities
- Reactor-MCP: Provides AI/tool access to document operations
- Connect/Switchboard: User interfaces and synchronization servers

The reactor-mcp essentially makes the sophisticated document model system accessible to AI agents and external tools through a standardized protocol, enabling programmatic document creation, modification, and management within the Powerhouse ecosystem.

</details>

### Document Model Agent

Alongside the MCP is a **specialized AI agent** for document model creation:

- Purpose: Guide users through creating document models
- Workflow: Requirements gathering → Design confirmation → Implementation
- Tools: Comprehensive set of MCP tools for model management
- Capabilities: 
    - State schema definition
    - Operation creation
    - Module organization
    - Code generation

:::tip Supports with:

1. **AI-Assisted Document Model Creation**: AI agents can use the MCP tools to help users create and modify document models
2. **Automated Document Management**: Programmatic creation and management of documents and drives
3. **Integration with AI Tools**: Claude, GPT, or other AI systems can use this as an MCP server to interact with Powerhouse
4. **Development Tooling**: CLI and development server for working with document models locally
:::

