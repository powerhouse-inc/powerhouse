# AI Resources

We have a couple of AI resources to help you with your daily work or exploring our ecosystem. 

:::warning
- Be aware that AI tooling can make mistakes.    
- Documentation can be out of date or code can be work in progress.    
- Always verify your coding agent's suggestions. 
:::


| Tool | Description |
|---|---|
| [**Deepwiki**](https://deepwiki.com/powerhouse-inc/powerhouse) | A searchable/queriable wiki to understand our growing Powerhouse **Monorepository** better. <br /> DeepWiki provides up-to-date documentation you can talk to, for every repo in the world. Think Deep Research for GitHub. |
| [**Context7**](https://context7.com/powerhouse-inc/powerhouse) | The Powerhouse **Academy Documentation** is also available as context through the context7 MCP Server. <br /> LLMs rely on outdated or generic information about the libraries you use. <br /> Context7 pulls up-to-date, version-specific documentation and code examples directly from the source. <br /> Paste accurate, relevant documentation directly into tools like Cursor, Claude, or any LLM. <br /> The official repository can be found [here](https://github.com/upstash/context7). |


### Context7 Installation

<details>
<summary><b>Install in Cursor</b></summary>

Go to: `Settings` -> `Cursor Settings` -> `MCP` -> `Add new global MCP server`

Pasting the following configuration into your Cursor `~/.cursor/mcp.json` file is the recommended approach. You may also install in a specific project by creating `.cursor/mcp.json` in your project folder.

**Cursor Local Server Connection**

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

</details>

<details>
<summary><b>Install in VS Code</b></summary>

Add this to your VS Code MCP config file. See [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) for more info.

**VS Code Local Server Connection**

```json
"mcp": {
  "servers": {
    "context7": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```
</details>

For other editors, please refer to the [official documentation](https://github.com/upstash/context7#%-installation).

### Context7 Troubleshooting

<details>
<summary><b>MCP, Documentation or Module Not Found Errors</b></summary>

If you encounter `ERR_MODULE_NOT_FOUND`, try using `bunx` instead of `npx`:

```json
{
  "mcpServers": {
    "context7": {
      "command": "bunx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

This often resolves module resolution issues in environments where `npx` doesn't properly install or resolve packages.

</details>

<details>
<summary><b>ESM Resolution Issues</b></summary>

For errors like `Error: Cannot find module 'uriTemplate.js'`, try the `--experimental-vm-modules` flag:

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "--node-options=--experimental-vm-modules", "@upstash/context7-mcp@1.0.6"]
    }
  }
}
```

</details>

<details>
<summary><b>TLS/Certificate Issues</b></summary>

Use the `--experimental-fetch` flag to bypass TLS-related problems:

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "--node-options=--experimental-fetch", "@upstash/context7-mcp"]
    }
  }
}
```

</details>

<details>
<summary><b>General MCP Client Errors</b></summary>

1. Try adding `@latest` to the package name
2. Use `bunx` as an alternative to `npx`
3. Consider using `deno` as another alternative
4. Ensure you're using Node.js v18 or higher for native fetch support

</details>

