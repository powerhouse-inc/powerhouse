# Operational Database Layer

A TypeScript-first operational layer for PGlite with live query capabilities, designed to provide type-safe database operations with real-time updates.

## Overview

This package provides a high-level operational layer on top of PGlite, offering type-safe database operations through Kysely and live query capabilities with real-time updates.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
  - [1. Define Your Database Schema](#1-define-your-database-schema)
  - [2. Create a Processor Query Hook](#2-create-a-typed-query-hook)
  - [3. Use It in Your Component](#3-use-it-in-your-component)
- [API Reference](#api-reference)
  - [createProcessorQuery<Schema>()](#createtypedqueryschema)
  - [Static Queries (no parameters)](#static-queries-no-parameters)
  - [Parameterized Queries](#parameterized-queries)
  - [Query Callback](#query-callback)
  - [Return Value](#return-value)
- [Dynamic Parameters](#dynamic-parameters)
  - [Basic Parameterized Query](#basic-parameterized-query)
  - [Parameters That Change Over Time](#parameters-that-change-over-time)
  - [Automatic Memoization](#automatic-memoization)
- [Usage Examples](#usage-examples)
  - [Basic Query](#basic-query)
  - [Query with Conditions](#query-with-conditions)
  - [Custom SQL Query](#custom-sql-query)
  - [Complex Joins](#complex-joins)
- [Component Usage](#component-usage)
- [Advanced Features](#advanced-features)
  - [Automatic Optimization](#automatic-optimization)
  - [Smart Parameter Memoization](#smart-parameter-memoization)
  - [Type Safety](#type-safety)
  - [Loading States](#loading-states)
- [Best Practices](#best-practices)
  - [1. Define Schema Types](#1-define-schema-types)
  - [2. Use Descriptive Hook Names](#2-use-descriptive-hook-names)
  - [3. Handle Loading and Error States](#3-handle-loading-and-error-states)
  - [4. Keep Queries Simple](#4-keep-queries-simple)
- [Troubleshooting](#troubleshooting)
  - [Common Issues](#common-issues)
  - [Debug Tips](#debug-tips)
- [Hooks API Reference](#hooks-api-reference)
  - [Core Hooks](#core-hooks)
    - [useOperationalStore<Schema>()](#useoperationalstoreschema)
    - [useLiveQuery<Schema, T>()](#uselivequeryschemat)
- [Utilities API Reference](#utilities-api-reference)
  - [createProcessorQuery<Schema>()](#createtypedqueryschema-1)
- [Hook Relationships](#hook-relationships)

## Key Features

- 🔒 **Type-safe queries** with full TypeScript support
- 🔄 **Live query capabilities** with real-time updates
- ⚡ **Automatic optimization** to prevent infinite re-renders
- 🎯 **Simple API** that abstracts away complexity
- 📦 **Flexible query format** - works with compiled queries or simple SQL strings
- 🔄 **Dynamic parameters** - queries update automatically when parameters change
- 🧠 **Smart memoization** - prevents unnecessary re-renders with deep parameter comparison

## Quick Start

### 1. Define Your Database Schema

```typescript
type MyDatabase = {
  users: {
    id: number;
    name: string;
    email: string;
  };
  posts: {
    id: number;
    title: string;
    content: string;
    author_id: number;
  };
};
```

### 2. Create a Processor Query Hook

```typescript
import { createProcessorQuery } from "@powerhousedao/reactor-browser/operational";

const useProcessorQuery = createProcessorQuery<MyDatabase>();
```

### 3. Use It in Your Component

```typescript
// Static query (no parameters)
export function useUserList() {
  const result = useProcessorQuery((db) => {
    return db.selectFrom("users").selectAll().compile();
  });

  return result;
}

// Dynamic query with parameters
export function useUserById(userId: number) {
  const result = useProcessorQuery(
    (db, params) => {
      return db
        .selectFrom("users")
        .selectAll()
        .where("id", "=", params.userId)
        .compile();
    },
    { userId },
  );

  return result;
}
```

## API Reference

### `createProcessorQuery<Schema>()`

Creates a typed query hook for your database schema with support for both static and dynamic parameterized queries.

**Returns:** A hook function with two overloads - one for static queries and one for parameterized queries.

#### Static Queries (no parameters)

```typescript
useQuery(queryCallback: (db: Kysely<Schema>) => QueryCallbackReturnType): QueryResult
```

#### Parameterized Queries

```typescript
useQuery(
  queryCallback: (db: Kysely<Schema>, parameters: TParams) => QueryCallbackReturnType,
  parameters: TParams
): QueryResult
```

#### Query Callback

The callback function receives an Enhanced Kysely database instance and optionally parameters. It must return an object with `sql` and optional `parameters` properties.

```typescript
type QueryCallbackReturnType = {
  sql: string;
  parameters?: readonly unknown[];
};
```

#### Return Value

```typescript
{
  isLoading: boolean; // True while query is loading
  error: Error | null; // Any error that occurred
  result: LiveQueryResults<T> | null; // Query results (live updates)
}
```

## Dynamic Parameters

One of the key features is support for dynamic parameters that automatically update your queries when they change.

### Basic Parameterized Query

```typescript
export function useUserById(userId: number) {
  const result = useProcessorQuery(
    (db, params) => {
      return db
        .selectFrom("users")
        .selectAll()
        .where("id", "=", params.userId)
        .compile();
    },
    { userId }, // Query updates when userId changes
  );

  return result;
}
```

### Parameters That Change Over Time

```typescript
export function useSearchResults() {
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState("all");

  // Query automatically updates when searchTerm or category changes
  const result = useProcessorQuery(
    (db, params) => {
      let query = db.selectFrom("products").selectAll();

      if (params.searchTerm) {
        query = query.where("name", "like", `%${params.searchTerm}%`);
      }

      if (params.category !== "all") {
        query = query.where("category", "=", params.category);
      }

      return query.compile();
    },
    { searchTerm, category },
  );

  return { result, setSearchTerm, setCategory };
}
```

### Automatic Memoization

Parameters are automatically memoized using deep comparison, so you don't need to wrap them in `useMemo`:

```typescript
// ✅ This works perfectly - no manual memoization needed
const parameters = {
  userId: user.id,
  status: "active",
  limit: 10,
};

const result = useProcessorQuery((db, params) => {
  return db
    .selectFrom("users")
    .selectAll()
    .where("id", "=", params.userId)
    .where("status", "=", params.status)
    .limit(params.limit)
    .compile();
}, parameters);
```

## Usage Examples

### Basic Query

```typescript
const useUsers = () => {
  const useProcessorQuery = createProcessorQuery<MyDatabase>();

  return useProcessorQuery((db) => {
    return db.selectFrom("users").selectAll().compile();
  });
};
```

### Query with Conditions

```typescript
const useUserById = (userId: number) => {
  const useProcessorQuery = createProcessorQuery<MyDatabase>();

  return useProcessorQuery(
    (db, params) => {
      return db
        .selectFrom("users")
        .selectAll()
        .where("id", "=", params.userId)
        .compile();
    },
    { userId },
  );
};
```

### Custom SQL Query

```typescript
const useCustomQuery = () => {
  const useProcessorQuery = createProcessorQuery<MyDatabase>();

  return useProcessorQuery((db) => {
    return {
      sql: "SELECT u.name, COUNT(p.id) as post_count FROM users u LEFT JOIN posts p ON u.id = p.author_id GROUP BY u.id, u.name",
    };
  });
};
```

### Complex Joins

```typescript
const useUsersWithPosts = () => {
  const useProcessorQuery = createProcessorQuery<MyDatabase>();

  return useProcessorQuery((db) => {
    return db
      .selectFrom("users")
      .leftJoin("posts", "users.id", "posts.author_id")
      .select([
        "users.id",
        "users.name",
        "users.email",
        "posts.title as post_title",
        "posts.content as post_content",
      ])
      .compile();
  });
};
```

## Component Usage

```typescript
import React from 'react';
import { createProcessorQuery } from '@powerhousedao/reactor-browser/operational';

type Database = {
  users: {
    id: number;
    name: string;
    email: string;
  };
};

const useProcessorQuery = createProcessorQuery<Database>();

export function UserList() {
  const { isLoading, error, result } = useProcessorQuery(db => {
    return db.selectFrom('users').selectAll().compile();
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!result) return <div>No data</div>;

  return (
    <ul>
      {result.rows.map(user => (
        <li key={user.id}>
          {user.name} - {user.email}
        </li>
      ))}
    </ul>
  );
}
```

## Advanced Features

### Automatic Optimization

The hook automatically handles query optimization to prevent infinite re-renders, including smart parameter memoization:

```typescript
// ✅ Static queries - automatically optimized
const result = useProcessorQuery((db) => {
  return db.selectFrom("users").selectAll().compile();
});

// ✅ Parameterized queries - parameters are automatically memoized
const parameters = { status: "active", limit: 10 };
const result = useProcessorQuery((db, params) => {
  return db
    .selectFrom("users")
    .selectAll()
    .where("status", "=", params.status)
    .limit(params.limit)
    .compile();
}, parameters);
```

### Smart Parameter Memoization

Parameters are automatically memoized using deep comparison with `lodash.isequal`, preventing unnecessary re-renders and query re-executions:

```typescript
// ✅ These won't cause re-renders (same content)
const params1 = { id: 1, name: "john" };
const params2 = { id: 1, name: "john" };

// ✅ This will cause a re-render (different content)
const params3 = { id: 2, name: "john" };

// ✅ No manual useMemo needed!
const result = useProcessorQuery(
  (db, params) => {
    return db
      .selectFrom("users")
      .selectAll()
      .where("id", "=", params.id)
      .compile();
  },
  { id: userId, name: userName },
); // Updates only when userId or userName changes
```

**Internal Implementation:**

- Uses `useStableParams()` utility with deep equality comparison
- Callback functions are automatically memoized when parameters change
- Prevents infinite re-renders even with complex nested parameter objects

### Type Safety

The hook provides full TypeScript support:

```typescript
// ✅ TypeScript will enforce the sql property
const result = useProcessorQuery((db) => {
  return db.selectFrom("users").selectAll().compile(); // Has sql property
});

// ❌ TypeScript error - missing sql property
const result = useProcessorQuery((db) => {
  return db.selectFrom("users").selectAll(); // No compile(), no sql property
});
```

### Loading States

The hook provides detailed loading states:

```typescript
const { isLoading, error, result } = useProcessorQuery((db) => {
  return db.selectFrom("users").selectAll().compile();
});

// isLoading combines:
// - Database connection loading
// - Operational store loading
// - Query execution loading
```

## Best Practices

### 1. Define Schema Types

Always define your database schema types for better type safety:

```typescript
type MyDatabase = {
  table_name: {
    column_name: type;
    // ... other columns
  };
  // ... other tables
};
```

### 2. Use Descriptive Hook Names

Create descriptive hook names for your queries:

```typescript
const useUserById = (id: number) => {
  /* ... */
};
const useActiveUsers = () => {
  /* ... */
};
const useUserPostCount = (userId: number) => {
  /* ... */
};
```

### 3. Handle Loading and Error States

Always handle loading and error states in your components:

```typescript
const { isLoading, error, result } = useProcessorQuery(/* ... */);

if (isLoading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} />;
if (!result) return <NoDataMessage />;
```

### 4. Keep Queries Simple

Prefer simple, focused queries over complex ones:

```typescript
// ✅ Good - focused query
const useUsers = () =>
  useProcessorQuery((db) => db.selectFrom("users").selectAll().compile());

// ❌ Avoid - too complex
const useEverything = () =>
  useProcessorQuery((db) =>
    db
      .selectFrom("users")
      .leftJoin("posts", "users.id", "posts.author_id")
      .leftJoin("comments", "posts.id", "comments.post_id")
      .selectAll()
      .compile(),
  );
```

## Troubleshooting

### Common Issues

1. **Infinite re-renders**: The hook automatically prevents this with smart parameter memoization. Parameters are compared by content, not reference.

2. **Type errors**: Make sure your callback returns an object with a `sql` property and optional `parameters` array.

3. **No data**: Check that your database is properly initialized and contains data.

4. **Parameters not updating**: Ensure parameter objects have different content, not just different references.

### Debug Tips

```typescript
// Debug static queries
const result = useProcessorQuery((db) => {
  const compiled = db.selectFrom("users").selectAll().compile();
  console.log("Query SQL:", compiled.sql);
  return compiled;
});

// Debug parameterized queries
const result = useProcessorQuery(
  (db, params) => {
    console.log("Query parameters:", params);
    const compiled = db
      .selectFrom("users")
      .selectAll()
      .where("id", "=", params.userId)
      .compile();
    console.log("Query SQL:", compiled.sql);
    console.log("SQL parameters:", compiled.parameters);
    return compiled;
  },
  { userId },
);
```

## Hooks API Reference

### Core Hooks

#### `useOperationalStore<Schema>()`

Returns an enhanced Kysely-wrapped database instance with full type safety for your schema and live query capabilities.

```typescript
const { db, isLoading, error } = useOperationalStore<MySchema>();
```

**Returns:**

```typescript
{
  db: EnhancedKysely<Schema> | null; // Type-safe Kysely database instance with live capabilities
  isLoading: boolean; // True while database is initializing
  error: Error | null; // Any initialization error
}
```

**Types:**

```typescript
// Enhanced Kysely instance with live query support
type EnhancedKysely<Schema> = Kysely<Schema> & { live: LiveNamespace };

// Query callback return type for operational queries
type QueryCallbackReturnType = {
  sql: string;
  parameters?: readonly unknown[];
};
```

````

**Usage:**
```typescript
import { useOperationalStore, type EnhancedKysely } from '@powerhousedao/reactor-browser/operational';

type MyDatabase = {
  users: {
    id: number;
    name: string;
  };
};

function DatabaseOperations() {
  const { db, isLoading, error } = useOperationalStore<MyDatabase>();

  const createUser = async (name: string) => {
    if (!db) return;

    // db is EnhancedKysely<MyDatabase> with both Kysely methods and live capabilities
    await db
      .insertInto('users')
      .values({ name })
      .execute();
  };

  return (
    <button onClick={() => createUser('John')}>
      Create User
    </button>
  );
}
````

#### `useOperationalQuery<Schema, T, TParams>()`

Lower-level hook for creating live queries with manual control over the query callback and parameter support.

```typescript
const { result, isLoading, error } = useOperationalQuery<Schema, T, TParams>(
  queryCallback,
  parameters,
);
```

**Parameters:**

- `queryCallback: (db: EnhancedKysely<Schema>, parameters?: TParams) => QueryCallbackReturnType` - Function that returns a query with SQL and optional parameters
- `parameters?: TParams` - Optional parameters for the query

**Returns:**

```typescript
{
  result: LiveQueryResults<T> | null; // Live query results
  isLoading: boolean; // Combined loading state
  error: Error | null; // Any error that occurred
}
```

**Usage:**

```typescript
import { useOperationalQuery } from '@powerhousedao/reactor-browser/operational';

function UserCount() {
  const { result, isLoading, error } = useOperationalQuery<MyDatabase, { count: number }>(
    (db) => db.selectFrom('users').select(db.fn.count('id').as('count')).compile()
  );

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>User count: {result?.rows[0]?.count ?? 0}</div>;
}
```

## Utilities API Reference

### `createProcessorQuery<Schema>()`

Creates a typed query hook for your database schema with automatic optimization and type safety.

**Already documented in detail above.** This is the main utility for creating type-safe live queries.

### Exported Types

The package exports several useful types for advanced use cases:

```typescript
import {
  type EnhancedKysely,
  type QueryCallbackReturnType,
  type IOperationalStore,
} from "@powerhousedao/reactor-browser/operational";

// Enhanced Kysely instance with live capabilities
type EnhancedKysely<Schema> = Kysely<Schema> & { live: LiveNamespace };

// Query callback return type
type QueryCallbackReturnType = {
  sql: string;
  parameters?: readonly unknown[];
};

// Operational store interface
interface IOperationalStore<Schema> {
  db: EnhancedKysely<Schema> | null;
  isLoading: boolean;
  error: Error | null;
}
```

## Hook Relationships

Understanding how the hooks work together:

1. **PGlite Layer** - `usePGliteDB()` provides the raw PGlite database instance
2. **`useOperationalStore()`** - Wraps the PGlite instance with Enhanced Kysely for type safety and live capabilities
3. **`useOperationalQuery()`** - Uses the operational store to provide live query functionality
4. **`createProcessorQuery()`** - Uses `useOperationalQuery()` internally with additional optimizations and parameter memoization

```typescript
// The relationship flow:
PGlite Layer → useOperationalStore() → useOperationalQuery() → createProcessorQuery()
```

## For Low-Level Database Operations

For low-level PGlite database management, use the PGlite layer:

```typescript
// For database initialization and state management
import {
  usePGliteDB,
  useSetPGliteDB,
} from "@powerhousedao/reactor-browser/pglite";
```

This operational layer builds on top of the PGlite foundation to provide everyday database operations with type safety and live updates.
