# Operational API Specification

## Goals

- Provide a type-safe, ergonomic API for querying a local operational database from TypeScript and React applications.
- Support subscribing to a query, to receive live updates when the underlying data changes.
- Enable developers to build and share queries, decoupling query construction from execution.
- Make it easy for an external package to expose a query builder of the operational tables it manages.

## Usage Overview

An external package can define an Operational Processor that listens for operations and populates custom tables on an SQL database.
Developers can then query those tables by importing a query builder from the external package. This instance is used to build type-safe queries for the tables managed by that package. These query objects are then passed to TS methods or React hooks, such as `useOperationalQuery` or `subscribeQuery`, which execute the queries on the operational database instance provided by the host app (e.g., via React context or other type of dependency injection).

This approach allows developers to:

- Create custom views of the operational data to support specific use cases.
- Build queries anywhere in their codebase or even in shared packages, without needing access to the database connection.
- Share and reuse query logic across different parts of an application or between packages.
- Retrieve query results in React components with type safety, loading, and error handling.

## Data

The system manages access to operational tables defined by external packages. Data flows as follows:

- **Definition**: Tables and their types are defined by an operational processor on an external package and exported as a TypeScript schema.
- **Setup**: Processors define a `setup` method where they can create the tables on the operational database or apply migrations if needed.
- **Population**: Processor listens to operations and populates the tables.
- **Query Building**: Query objects are constructed using the query builder provided by the external package. These objects are serializable and do not require a live database connection.
- **Query Execution**: React hooks such as `useOperationalQuery` receive query objects, execute them against the real database, and return the results to the component.

## Interfaces and Abstractions

### Core API

The Core API provides framework-agnostic primitives for building and executing queries against the operational database. It is designed for use in TypeScript/JavaScript environments, independent of React or any UI framework.

#### Query Builder

- Offers a type-safe API to build a query and outputs a compiled query compatible with the operational database Query Execution API. Output can be as simple as a string with a raw SQL query.
- Exported from a PH package.
- Used only for building queries; cannot execute them.

The actual Query Builder API exported by a package will depend on it's implementation. It is expected to be type-safe, according to the DB schema, but can just be a simple method that returns a string with a SQL query.
A good example is Kysely: https://kysely.dev/docs/recipes/splitting-query-building-and-execution

**Example:**

```ts
import { DB } from "package/custom-operational-db"; // kysely based implementation

const query = DB.selectFrom("person").select("first_name").where("id", "=", id);
```

#### Query Execution

##### One-off Query

```ts
db.query<T extends CompiledQuery>(query: T): Promise<InferResult<T>[]>
```

- Executes the provided query builder object against the operational database.
- Returns a promise of the typed result set.

##### Subscription Query

```ts
db.subscribeQuery<T extends CompiledQuery>(
  query: T,
  callback: (rows: InferResult<T>[]) => void
): UnsubscribeFn
```

- Subscribes to changes for the provided query.
- Calls the callback with updated results whenever the underlying data changes.
- Returns an unsubscribe function.

### React API

The React API wraps the Core API to provide idiomatic hooks for use in React components. These hooks handle state, effects, and cleanup automatically.

#### useOperationalQuery

```ts
function useOperationalQuery<T extends CompiledQuery>(
  query: T,
): {
  data: InferResult<T>[] | undefined;
  loading: boolean;
  error: Error | undefined;
};
```

- Executes a static query and manages loading/error state.

**Usage Example:**

```ts
import { PackageDB } from "package/custom-operational-db";

function PersonView({ id }: { id: string }) {
  const { data, loading, error } = useOperationalQuery(
    PackageDB.selectFrom("person").selectAll().where("id", "=", id),
  );
  // ...
}
```

#### useSubscribeQuery

```ts
function useSubscribeQuery<T extends CompiledQuery>(
  query: T,
): {
  data: InferResult<T>[] | undefined;
  loading: boolean;
  error: Error | undefined;
};
```

- Subscribes to live updates for the query and manages state.

**Usage Example:**

```ts
function LivePersonList() {
  const { data, loading, error } = useSubscribeQuery(
    PackageDB.selectFrom("person").selectAll(),
  );
  // ...
}
```

## Performance Considerations (optional)

Identify the hotspots of the system: What will use the most memory? What will use the most CPU or GPU? Describe how you know this, how you will make decisions about it, and specific mitigations put in place. Describe whether or not benchmarks will be required, and a loose idea of what they should measure.

## Security (optional)

Describe the worst case scenario and how your system mitigates this risk. Does a compromised system put other users at risk? Does it put infrastructure at risk? Identify who and what data may be affected. Then make an argument for why it either doesn’t matter or how your system takes this into account.

- SQL injection
- Access control on the database

## Testing

Outline a testing plan. For development, this may involve TDD, integration tests, and/or end user tests on device. Describe the delivery to QA and how you will use environments, branching strategies, etc to insulate testing.

## Rollout

Describe how will the system be released to end users. The target audience should be mentioned with explicit steps of how they will consume the system.

## Unknowns

Use this section to list any unknowns or questions that you have about the system. If there are no unknowns, simply write "None".
