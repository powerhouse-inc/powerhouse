---
sidebar_position: 102
---

# Benchmarks

Due to the performance-sensitive nature of metrics collection, we include a [suite of benchmarks](https://github.com/powerhouse-inc/analytics-engine/tree/main/benchmarks) that compare the various analytics store implementations. These are run every publish and stored in the associated [GitHub action history](https://github.com/powerhouse-inc/analytics-engine/actions/runs/12123429624/job/33798972072).

We also include results from major releases [here](https://github.com/powerhouse-inc/analytics-engine/tree/main/benchmarks/results).

In summary, we have found that the `MemoryAnalyticsStore` and `PostgresAnalyticsStore` implementations are very close in performance, with the Postgres implementation slightly faster in most applications.

## Query-list

In [this benchmark](https://github.com/powerhouse-inc/analytics-engine/blob/main/benchmarks/results/query-list/), we ran the most frequent 600+ real-world queries against matching tables of around 200k records.

We found that, on average, the `MemoryAnalyticsStore` implementation took about `1.36x` the time it took `PostgresAnalyticsStore`. Full results [here](https://github.com/powerhouse-inc/analytics-engine/blob/main/benchmarks/results/query-list/pglite.txt).

## WASM

In [this benchmark](https://github.com/powerhouse-inc/analytics-engine/blob/main/benchmarks/results/wasm/), we analyze the startup and insert time for the `MemoryAnalyticsStore` implementation.

| Operation    | Ops per Sec | Average Time |
| ------------ | ----------- | ------------ |
| Init         | 3           | 323.00 ms    |
| 100 Inserts  | 478         | 2.08 ms      |
| 200k Inserts | 0           | 4448.10 ms   |