# TODO

- [ ] Recreate document-model specification
- [ ] Test Claude usage and fix any issues
- [ ] Integrate with `ph vetra`
- [ ] Rename `reactor-mcp` to `reactor-ai` and restructure package
- [ ] Integrate tools with AI SDK
- [ ] Implement chat agent with access to reactor tools
- [ ] Implement chat agent unit tests
- [ ] Implement CLI interface for chat agent
  - [ ] use `prompts` package for richer UI?
- [ ] Implement REST API for chat agent
- [ ] Implement web UI for chat agent
- [ ] Integrate agent on document-model editor

## Core Foundation

- [ ] **Recreate document-model specification**
  - Update MCP tool schemas with current document-model types
  - Fix TypeScript imports and exports
  - Validate all operations work with latest document-model version

- [ ] **Test Claude usage and fix any issues**
  - Test all MCP tools with Claude Code
  - Fix schema validation errors
  - Ensure tool descriptions are clear and actionable

- [ ] **Integrate with `ph vetra`**
  - Research vetra integration patterns
  - Add vetra as dependency if needed
  - Implement vetra-compatible interfaces

## Package Restructure

- [ ] **Rename `reactor-mcp` to `reactor-ai` and restructure package**
  - Update package.json name and exports
  - Reorganize src/ structure: `core/`, `mcp/`, `chat/`, `cli/`, `web/`
  - Update imports across codebase
  - Maintain backward compatibility for MCP server mode

## AI Integration

- [ ] **Integrate tools with AI SDK**
  - Replace current LLM chat with AI SDK streamText/generateObject
  - Add tool calling support using existing reactor operations
  - Support multiple providers (OpenAI, Anthropic, local models)

- [ ] **Implement chat agent with access to reactor tools**
  - Create agent class that can call reactor operations
  - Add conversation memory and context management
  - Implement tool result formatting for natural responses

- [ ] **Implement chat agent unit tests**
  - Test tool calling with mocked reactor operations
  - Test conversation flow and memory management
  - Test error handling and recovery

## Interfaces

- [ ] **Implement CLI interface for chat agent**
  - Interactive chat mode: `reactor-ai chat`
  - Command mode: `reactor-ai ask "create a budget document"`
  - Configuration: model selection, API keys
  - [ ] use `prompts` package for richer UI?

- [ ] **Implement REST API for chat agent**
  - Express server with `/chat` endpoint
  - WebSocket support for streaming responses
  - Authentication middleware
  - Rate limiting and error handling

- [ ] **Implement web UI for chat agent**
  - React chat interface with message history
  - Document preview pane showing agent actions
  - Model configuration panel
  - Real-time updates via WebSocket

## Document Model Integration

- [ ] **Integrate agent on document-model editor**
  - Add AI assistance panel to existing editors
  - Context-aware suggestions based on document type
  - Quick actions: "summarize", "validate", "suggest improvements"
  - Integration with `@powerhousedao/design-system`
