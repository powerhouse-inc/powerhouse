# Document Drive

### Links

- How [logging](./docs/logging.md) works.

### Quickstart

#### Prerequisites

First, ensure your node version is compatible:

```
"engines": {
  "node": ">=20"
}
```

For example, to use `20.10.0`:

```
npx install 20.10.0
npx use 20.10.0
```

Next, ensure you have PNPM 9 installed, _which is not the latest version_, and install packages

```
npx pnpm@9 install
pnpm install
```

Finally, create a `.env`:

```
cp .env.example .env
```

#### Testing

Many of our tests require Postgres and Redis to run. This is why we've included a `docker-compose.test.yml`. Spin it up:

```
docker compose -f docker-compose.test.yml up -d
```

Then ensure that the db schema is up to date with:

```
pnpm migrate
```

Finally, run tests with:

```
pnpm test
```

Or run tests on a file watcher with:

```
pnpm test:watch
```

### Troubleshooting

#### `package.json` scripts fail with "Cannot find module"

Remove modules from this project _and_ the parent project.

```
rm -rf node_modules ../node_modules
pnpm install
```

#### I need to clear the test database.

The `docker-compose` file is configured to mount the postgres volume to the local directory, `.db`. This makes clearing the db very easy:

```
rm -rf .db
```

Be sure to set the database up again with:

```
pnpm migrate
```
