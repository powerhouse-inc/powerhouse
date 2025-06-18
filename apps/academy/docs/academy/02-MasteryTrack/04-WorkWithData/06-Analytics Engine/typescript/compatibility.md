---
sidebar_position: 101
---

# Compatibility

This guide is intended for making high level decisions about which storage systems to use in which contexts. These stores have not been tested across thousands of browser or serverside runtime versions.

| Store                    | Browser | Node | Bun |
| ------------------------ | ------- | ---- | --- |
| `MemoryAnalyticsStore`   | X       | X    | X   |
| `BrowserAnalyticsStore`  | X       |      |     |
| `KnexAnalyticsStore`     | X       | X    | X   |
| `PostgresAnalyticsStore` |         | X    | X   |
