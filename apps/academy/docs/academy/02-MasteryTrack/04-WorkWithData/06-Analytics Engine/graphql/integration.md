---
sidebar_position: 1
---

# Integration

The `analytics-engine-graphql` module provides types and resolvers needed for a fully-functional GraphQL Server API. This library has no dependencies on any particular server but has been tested using [Apollo Server 3 and 4](https://www.apollographql.com/docs/apollo-server).

## Resolvers and Types

The graphql package contains typical resolvers and typedefs. The resolvers, however, are dependent on another object: `AnalyticsModel`. This object is responsible for connecting GQL types with an `IAnalyticsStore` implementation.

```typescript
import { AnalyticsModel, AnalyticsResolvers, typedefs } from "@powerhousedao/analytics-engine-graphql";
import { AnalyticsQueryEngine } from "@powerhousedao/analytics-engine-core";
import { MemoryAnalyticsStore } from "@powerhousedao/analytics-engine-browser";

const model = new AnalyticsModel(new AnalyticsQueryEngine(new MemoryAnalyticsStore()));
```

> Note that the analytics resolvers require the passed in context to have an `AnalyticsModel` implementation on it. See below for details.

### Apollo 4

A minimal Apollo 4 example is noted below for completeness, but a full working example can be found in the [MakerDAO-SES Ecosystem API repo](https://github.com/makerdao-ses/ecosystem-api/). Note, in particular, that we pass along a specific context in the Apollo express middleware.

```typescript
import express from "express";
import http from "http";

import { makeExecutableSchema } from "@graphql-tools/schema";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';

import { AnalyticsModel, AnalyticsResolvers, typedefs } from "@powerhousedao/analytics-engine-graphql";
import { AnalyticsQueryEngine } from "@powerhousedao/analytics-engine-core";
import { MemoryAnalyticsStore } from "@powerhousedao/analytics-engine-browser";

// create a typical http service
const app = express();
const httpServer = http.createServer(app);

// create analytics gql schema from typedefs + resolvers
const schema = makeExecutableSchema({
  typeDefs: typedefs,
  resolvers: AnalyticsResolvers,
});

// create an apollo instance
const plugins = [ApolloServerPluginDrainHttpServer({ httpServer }), responseCachePlugin()];
const server = new ApolloServer({
  schema,
  plugins,
});

await server.start();

// needed by the analytics resolvers
const model = new AnalyticsModel(new AnalyticsQueryEngine(new MemoryAnalyticsStore()));

app.use("/graphql",
  express.json(),
  expressMiddleware(server, {
    context: ({ req }) => {
      // the analytics resolvers expect this on the context
      return {
        dataSources: { db: { Analytics: model } },
      };
    },
  }),
);

await new Promise<void>((resolve) => httpServer.listen(options, resolve));
```
