# Package manifest: config

`powerhouse.manifest.json` describes a package. Its `config` array lists the environment variables
the package needs, so a host (such as the Vetra hosting UI) can ask the operator for them.

```json
{
  "config": [
    { "name": "PH_API_URL", "type": "var", "required": true, "default": "https://api.example.com" },
    { "name": "PH_API_KEY", "type": "secret", "required": true },
    { "name": "AUTH_ENABLED", "type": "boolean", "default": "false", "description": "Require a signed-in caller." }
  ]
}
```

## Entry fields

| Field | Type | Meaning |
|---|---|---|
| `name` | string | The environment variable. Entries are unique by name; `ph generate` merges by name. |
| `type` | `"var"` \| `"secret"` \| `"boolean"` | How the host asks for the value (below). |
| `description` | string, optional | Shown to the operator. |
| `required` | boolean, optional | The package does not work without a value. |
| `default` | string, optional | The value the host falls back to, spelled as the env var would be. |

## Types

| Type | Host renders | Value written | `default` |
|---|---|---|---|
| `var` | free-text field | the text | any string |
| `secret` | masked field, never displayed back | the text | ignored |
| `boolean` | toggle | `"true"` or `"false"` | `"true"` or `"false"` only |

A package reads a boolean the way the Switchboard does: `process.env.AUTH_ENABLED === "true"`.

## Validation

`ph generate` parses the manifest and stops on an invalid entry. The error is a JSON array with one
item per problem. Each item gives its `path` as an array and its `message`, for example:

```json
[
  {
    "code": "invalid_value",
    "path": ["config", 0, "type"],
    "message": "type must be one of \"var\", \"secret\", \"boolean\""
  }
]
```

A boolean with a bad default gives `"path": ["config", 2, "default"]` and the message
`default must be "true" or "false" for a boolean entry`.
