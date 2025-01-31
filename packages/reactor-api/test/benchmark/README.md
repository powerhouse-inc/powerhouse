### Overview

Benchmarks on various reactor components, generally run with `tinybench`.

##### Setup

- Go to the [Sky Connect Instance](https://connect.sky.money/).
- Select `Blocktower` > `BlocktowerAndromeda`.
- In the upper right, click `Export` to download a zip.
- Move the zip to `/test/data/BlocktowerAndromeda.zip`.

#### Run

From the `packages/reactor-api` working directory:

```
pnpm build:bench
pnpm bench:node
pnpm bench:bun
```

Output will look like:

```
┌───┬───────────────────────────────┬──────────────────┬────────────────────┬────────────────────────┬────────────────────────┬─────────┐
│   │ Task name                     │ Latency avg (ns) │ Latency med (ns)   │ Throughput avg (ops/s) │ Throughput med (ops/s) │ Samples │
├───┼───────────────────────────────┼──────────────────┼────────────────────┼────────────────────────┼────────────────────────┼─────────┤
│ 0 │ Load PHDM into Document Drive │ 1023942 ± 2.14%  │ 985125 ± 216083.00 │ 1079 ± 1.92%           │ 1015 ± 221             │ 977     │
└───┴───────────────────────────────┴──────────────────┴────────────────────┴────────────────────────┴────────────────────────┴─────────┘
```

### `/fns`

This folder contains the individual functions to run.

##### `load.ts`

This benchmarks the import of a fairly large document into a document drive server.