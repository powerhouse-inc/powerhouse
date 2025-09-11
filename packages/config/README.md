# Powerhouse Config

This package contains the configuration for the Powerhouse monorepo.

### `powerhouse.config.json`

Below is an example configuration file:

```
{
  "documentModelsDir": "./document-models",
  "editorsDir": "./editors",
  "logLevel": "verbose",
  "studio": {
    "port": 3000
  },
  "reactor": {
    "port": 4001
  },
  "packages": []
}
```

Running `ph` commands (like `ph reactor`) from a directory containing a `powerhouse.config.json` will use these values to configure services.

### Options

##### `logLevel`

See the [logging documentation](../document-drive/docs/logging.md) for a comprehensive description.

#### `reactor`

These options affect the `ph reactor` command.

| Name                     | Description                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `port`                   | The port at which to receive traffic.                                                                                                                         |
| `storage.type`           | Configures the storage layer of reactor. Use `memory`, `filesystem`, `browser`, or `postgres`.                                                                |
| `storage.postgresUrl`    | If `postgres` is configured as the storage layer, this defines the postgres connection string. Eg - `postgresql://postgres:postgres@localhost:5444/postgres`. |
| `storage.filesystemPath` | If `filesystem` is configured as the storage layer, this defines the root folder.                                                                             |
