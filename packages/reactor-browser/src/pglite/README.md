# PGlite Integration

A TypeScript-first integration for PGlite with live query capabilities, designed to provide type-safe database operations with real-time updates.

## Overview

This package provides a set of utilities and hooks for working with PGlite databases in React applications, with a focus on type safety and live query capabilities.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
  - [1. Define Your Database Schema](#1-define-your-database-schema)
  - [2. Create a Typed Query Hook](#2-create-a-typed-query-hook)
  - [3. Use It in Your Component](#3-use-it-in-your-component)
- [API Reference](#api-reference)
  - [createTypedQuery<Schema>()](#createtypedqueryschema)
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
    - [usePGliteDB()](#usepglitedb)
    - [useSetPGliteDB()](#usesetpglitedb)
    - [usePGlite()](#usepglite)
    - [useOperationalDB<Schema>()](#useoperationaldbschema)
    - [useLiveQuery<Schema, T>()](#uselivequeryschemat)
- [Utilities API Reference](#utilities-api-reference)
  - [createTypedQuery<Schema>()](#createtypedqueryschema-1)
- [Re-exported Electric SQL Types](#re-exported-electric-sql-types)
- [Hook Relationships](#hook-relationships)
- [Global State Management](#global-state-management)
- [Events](#events)

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

### 2. Create a Typed Query Hook

```typescript
import { createTypedQuery } from '@powerhousedao/reactor-browser/pglite';

const useTypedQuery = createTypedQuery<MyDatabase>();
```

### 3. Use It in Your Component

```typescript
// Static query (no parameters)
export function useUserList() {
  const result = useTypedQuery(db => {
    return db.selectFrom('users').selectAll().compile();
  });

  return result;
}

// Dynamic query with parameters
export function useUserById(userId: number) {
  const result = useTypedQuery(
    (db, params) => {
      return db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', params.userId)
        .compile();
    },
    { userId }
  );

  return result;
}
```

## API Reference

### `createTypedQuery<Schema>()`

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

The callback function receives a Kysely database instance and optionally parameters. It must return an object with `sql` and optional `parameters` properties.

```typescript
type QueryCallbackReturnType = { 
  sql: string;
  parameters?: readonly unknown[];
};
```

#### Return Value

```typescript
{
  isLoading: boolean;    // True while query is loading
  error: Error | null;   // Any error that occurred
  result: LiveQueryResults<T> | null; // Query results (live updates)
}
```

## Dynamic Parameters

One of the key features is support for dynamic parameters that automatically update your queries when they change.

### Basic Parameterized Query

```typescript
export function useUserById(userId: number) {
  const result = useTypedQuery(
    (db, params) => {
      return db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', params.userId)
        .compile();
    },
    { userId } // Query updates when userId changes
  );

  return result;
}
```

### Parameters That Change Over Time

```typescript
export function useSearchResults() {
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('all');

  // Query automatically updates when searchTerm or category changes
  const result = useTypedQuery(
    (db, params) => {
      let query = db.selectFrom('products').selectAll();
      
      if (params.searchTerm) {
        query = query.where('name', 'like', `%${params.searchTerm}%`);
      }
      
      if (params.category !== 'all') {
        query = query.where('category', '=', params.category);
      }
      
      return query.compile();
    },
    { searchTerm, category }
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
  status: 'active',
  limit: 10
};

const result = useTypedQuery((db, params) => {
  return db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', params.userId)
    .where('status', '=', params.status)
    .limit(params.limit)
    .compile();
}, parameters);
```

## Usage Examples

### Basic Query

```typescript
const useUsers = () => {
  const useTypedQuery = createTypedQuery<MyDatabase>();
  
  return useTypedQuery(db => {
    return db.selectFrom('users').selectAll().compile();
  });
};
```

### Query with Conditions

```typescript
const useUserById = (userId: number) => {
  const useTypedQuery = createTypedQuery<MyDatabase>();
  
  return useTypedQuery(
    (db, params) => {
      return db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', params.userId)
        .compile();
    },
    { userId }
  );
};
```

### Custom SQL Query

```typescript
const useCustomQuery = () => {
  const useTypedQuery = createTypedQuery<MyDatabase>();
  
  return useTypedQuery(db => {
    return { 
      sql: 'SELECT u.name, COUNT(p.id) as post_count FROM users u LEFT JOIN posts p ON u.id = p.author_id GROUP BY u.id, u.name'
    };
  });
};
```

### Complex Joins

```typescript
const useUsersWithPosts = () => {
  const useTypedQuery = createTypedQuery<MyDatabase>();
  
  return useTypedQuery(db => {
    return db
      .selectFrom('users')
      .leftJoin('posts', 'users.id', 'posts.author_id')
      .select([
        'users.id',
        'users.name',
        'users.email',
        'posts.title as post_title',
        'posts.content as post_content'
      ])
      .compile();
  });
};
```

## Component Usage

```typescript
import React from 'react';
import { createTypedQuery } from '@powerhousedao/reactor-browser/pglite';

type Database = {
  users: {
    id: number;
    name: string;
    email: string;
  };
};

const useTypedQuery = createTypedQuery<Database>();

export function UserList() {
  const { isLoading, error, result } = useTypedQuery(db => {
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
const result = useTypedQuery(db => {
  return db.selectFrom('users').selectAll().compile();
});

// ✅ Parameterized queries - parameters are automatically memoized
const parameters = { status: 'active', limit: 10 };
const result = useTypedQuery((db, params) => {
  return db
    .selectFrom('users')
    .selectAll()
    .where('status', '=', params.status)
    .limit(params.limit)
    .compile();
}, parameters);
```

### Smart Parameter Memoization

Parameters are automatically memoized using deep comparison, preventing unnecessary re-renders:

```typescript
// ✅ These won't cause re-renders (same content)
const params1 = { id: 1, name: 'john' };
const params2 = { id: 1, name: 'john' };

// ✅ This will cause a re-render (different content)
const params3 = { id: 2, name: 'john' };

// ✅ No manual useMemo needed!
const result = useTypedQuery((db, params) => {
  return db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', params.id)
    .compile();
}, { id: userId, name: userName }); // Updates only when userId or userName changes
```

### Type Safety

The hook provides full TypeScript support:

```typescript
// ✅ TypeScript will enforce the sql property
const result = useTypedQuery(db => {
  return db.selectFrom('users').selectAll().compile(); // Has sql property
});

// ❌ TypeScript error - missing sql property
const result = useTypedQuery(db => {
  return db.selectFrom('users').selectAll(); // No compile(), no sql property
});
```

### Loading States

The hook provides detailed loading states:

```typescript
const { isLoading, error, result } = useTypedQuery(db => {
  return db.selectFrom('users').selectAll().compile();
});

// isLoading combines:
// - Database connection loading
// - Operational DB loading  
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
const useUserById = (id: number) => { /* ... */ };
const useActiveUsers = () => { /* ... */ };
const useUserPostCount = (userId: number) => { /* ... */ };
```

### 3. Handle Loading and Error States

Always handle loading and error states in your components:

```typescript
const { isLoading, error, result } = useTypedQuery(/* ... */);

if (isLoading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} />;
if (!result) return <NoDataMessage />;
```

### 4. Keep Queries Simple

Prefer simple, focused queries over complex ones:

```typescript
// ✅ Good - focused query
const useUsers = () => useTypedQuery(db => 
  db.selectFrom('users').selectAll().compile()
);

// ❌ Avoid - too complex
const useEverything = () => useTypedQuery(db => 
  db.selectFrom('users')
    .leftJoin('posts', 'users.id', 'posts.author_id')
    .leftJoin('comments', 'posts.id', 'comments.post_id')
    .selectAll()
    .compile()
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
const result = useTypedQuery(db => {
  const compiled = db.selectFrom('users').selectAll().compile();
  console.log('Query SQL:', compiled.sql);
  return compiled;
});

// Debug parameterized queries
const result = useTypedQuery((db, params) => {
  console.log('Query parameters:', params);
  const compiled = db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', params.userId)
    .compile();
  console.log('Query SQL:', compiled.sql);
  console.log('SQL parameters:', compiled.parameters);
  return compiled;
}, { userId });
```

## Hooks API Reference

### Core Hooks

#### `usePGliteDB()`

Returns the current PGlite database state with loading and error information.

```typescript
const { db, isLoading, error } = usePGliteDB();
```

**Returns:**
```typescript
{
  db: PGliteWithLive | null;    // PGlite database instance with live query support
  isLoading: boolean;           // True while database is initializing
  error: Error | null;          // Any initialization error
}
```

**Usage:**
```typescript
import { usePGliteDB } from '@powerhousedao/reactor-browser/pglite';

function DatabaseStatus() {
  const { db, isLoading, error } = usePGliteDB();
  
  if (isLoading) return <div>Database initializing...</div>;
  if (error) return <div>Database error: {error.message}</div>;
  if (!db) return <div>No database connection</div>;
  
  return <div>Database ready!</div>;
}
```

#### `useSetPGliteDB()`

Returns a function to update the PGlite database state.

```typescript
const setPGliteState = useSetPGliteDB();
```

**Returns:**
```typescript
(pglite: Partial<PGliteState>) => void
```

**Usage:**
```typescript
import { useSetPGliteDB } from '@powerhousedao/reactor-browser/pglite';

function DatabaseSetup() {
  const setPGliteState = useSetPGliteDB();
  
  const initializeDatabase = async () => {
    setPGliteState({ isLoading: true });
    
    try {
      const db = await createPGliteInstance();
      setPGliteState({ db, isLoading: false, error: null });
    } catch (error) {
      setPGliteState({ error: error as Error, isLoading: false });
    }
  };
  
  return <button onClick={initializeDatabase}>Initialize DB</button>;
}
```

#### `usePGlite()`

Convenience hook that returns both the database state and setter function.

```typescript
const [pglite, setPGlite] = usePGlite();
```

**Returns:**
```typescript
[PGliteState, (pglite: Partial<PGliteState>) => void]
```

**Usage:**
```typescript
import { usePGlite } from '@powerhousedao/reactor-browser/pglite';

function DatabaseManager() {
  const [{ db, isLoading, error }, setPGlite] = usePGlite();
  
  // Use db, isLoading, error for state
  // Use setPGlite to update state
}
```

#### `useOperationalDB<Schema>()`

Returns a Kysely-wrapped database instance with full type safety for your schema.

```typescript
const { db, isLoading, error } = useOperationalDB<MySchema>();
```

**Returns:**
```typescript
{
  db: Kysely<Schema> | null;    // Type-safe Kysely database instance
  isLoading: boolean;           // True while database is initializing
  error: Error | null;          // Any initialization error
}
```

**Usage:**
```typescript
import { useOperationalDB } from '@powerhousedao/reactor-browser/pglite';

type MyDatabase = {
  users: {
    id: number;
    name: string;
  };
};

function DatabaseOperations() {
  const { db, isLoading, error } = useOperationalDB<MyDatabase>();
  
  const createUser = async (name: string) => {
    if (!db) return;
    
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
```

#### `useLiveQuery<Schema, T>()`

Lower-level hook for creating live queries with manual control over the query callback.

```typescript
const { result, isLoading, error } = useLiveQuery<Schema, T>(queryCallback);
```

**Parameters:**
- `queryCallback: (db: Kysely<Schema>) => { sql: string }` - Function that returns a query with SQL

**Returns:**
```typescript
{
  result: LiveQueryResults<T> | null;  // Live query results
  isLoading: boolean;                  // Combined loading state
  error: Error | null;                 // Any error that occurred
}
```

**Usage:**
```typescript
import { useLiveQuery } from '@powerhousedao/reactor-browser/pglite';

function UserCount() {
  const { result, isLoading, error } = useLiveQuery<MyDatabase, { count: number }>(
    (db) => db.selectFrom('users').select(db.fn.count('id').as('count')).compile()
  );
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return <div>User count: {result?.rows[0]?.count ?? 0}</div>;
}
```

## Utilities API Reference

### `createTypedQuery<Schema>()`

Creates a typed query hook for your database schema with automatic optimization and type safety.

**Already documented in detail above.** This is the main utility for creating type-safe live queries.

## Re-exported Electric SQL Types

This package also re-exports useful types and utilities from `@electric-sql/pglite`:

```typescript
import { 
  PGlite, 
  PGliteWorker, 
  worker,
  // All live query types
  type LiveQuery,
  type LiveQueryResults,
  type PGliteWorkerOptions 
} from '@powerhousedao/reactor-browser/pglite';
```

## Hook Relationships

Understanding how the hooks work together:

1. **`usePGliteDB()`** - Provides the raw PGlite database instance
2. **`useOperationalDB()`** - Wraps the PGlite instance with Kysely for type safety
3. **`useLiveQuery()`** - Uses both hooks internally to provide live query functionality
4. **`createTypedQuery()`** - Uses `useLiveQuery()` internally with additional optimizations

```typescript
// The relationship flow:
usePGliteDB() → useOperationalDB() → useLiveQuery() → createTypedQuery()
```

## Global State Management

The hooks use global state management through the `window.pglite` object:

```typescript
// Global state structure
window.pglite = {
  db: PGliteWithLive | null,
  isLoading: boolean,
  error: Error | null
};
```

This ensures that:
- Database state is shared across all components
- State updates trigger re-renders in all consuming components
- Database initialization happens once globally

## Events

The system uses custom events for state synchronization:

- **`PGLITE_UPDATE_EVENT`** - Fired when the PGlite state changes
- All hooks automatically subscribe to this event for reactive updates 