#### Benchmarks

The code in this directory measures various performance characteristics the analytics engine.

##### Migrate to Local

For many of these test, it is necessary to migrate a remote database to your local database. This is straightforward with the script provided.

```
# start postgres
docker compose -f ../pg/docker-compose.test.yml up -d

# migrate
./scripts/dump-db.sh <user> <password> <host> <db>
```

This will create a data dump in the `/data` folder and insert it for you.

> This script is for macOS users. If you're on Linux, open the script look for the `# GNU sed (Linux)` block.

### Execute

The tests may take awhile to run.

```
docker compose -f ../pg/docker-compose.test.yml up -d
pnpm benchmark
```
