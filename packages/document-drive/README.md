# Document Drive

### Quickstart

#### Prerequisites

First, ensure your node version is compatible:

```
"engines": {
  "node": ">=20"
}
```

For example:

```
npx use 20.10.0
```

Next, ensure you have PNPM 9 installed, _which is not the latest version_.

```
npx pnpm@9 install
```

Finally, install.

```
pnpm install
```

#### Testing

Currently, most tests will fail as it requires a Postgres with the correct schema.

```
pnpm test
```

### Troubleshooting

#### `package.json` scripts fail with "Cannot find module"

Remove modules from this project _and_ the parent project.

```
rm -rf node_modules ../node_modules
pnpm install
```
