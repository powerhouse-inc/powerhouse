# Relational Database

This page covers the relational database tools available in Powerhouse applications, providing type-safe database operations with real-time updates through PGlite integration.

## Overview

The relational database layer gives you powerful tools to work with data in your Powerhouse applications. You get type-safe queries, real-time updates, and a simple API that feels familiar to React developers.

**Key Benefits:**
- **Type-safe queries** with full TypeScript support
- **Live query capabilities** with real-time updates  
- **Automatic optimization** to prevent infinite re-renders
- **Simple API** that abstracts away complexity
- **Smart memorization** for parameters and queries

## Quick Start

<details>
<summary>Setting up your first relational database query</summary>

### Step 1: Define your database schema

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

### Step 2: Create a typed query hook

```typescript
import { createProcessorQuery } from '@powerhousedao/reactor-browser/relational';

const useTypedQuery = createProcessorQuery<MyDatabase>();
```

### Step 3: Use it in your component

```typescript
// Simple query - no parameters needed
export function useUserList() {
  return useTypedQuery(db => {
    return db.selectFrom('users').selectAll().compile();
  });
}

// Query with parameters
export function useUserById(userId: number) {
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
}
```

### Step 4: Use in your React component

```typescript
function UserList() {
  const { isLoading, error, result } = useUserList();

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

</details>

## Core Hooks

### 1. createProcessorQuery()

<details>
<summary>`createProcessorQuery<Schema>()`: Creates a typed query hook for your database schema</summary>

### Hook Name and Signature

```typescript
function createProcessorQuery<Schema>(): TypedQueryHook<Schema>
```

### Description

Creates a typed query hook that provides type-safe database operations with live query capabilities. This is the main hook you'll use for most relational database operations in your components.

### Usage Example

```typescript
import { createProcessorQuery } from '@powerhousedao/reactor-browser/relational';

type AppDatabase = {
  users: { id: number; name: string; email: string };
  posts: { id: number; title: string; author_id: number };
};

const useTypedQuery = createProcessorQuery<AppDatabase>();

// Static query (no parameters)
function useAllUsers() {
  return useTypedQuery(db => {
    return db.selectFrom('users').selectAll().compile();
  });
}

// Dynamic query with parameters
function useUsersByStatus(status: string) {
  return useTypedQuery(
    (db, params) => {
      return db
        .selectFrom('users')
        .selectAll()
        .where('status', '=', params.status)
        .compile();
    },
    { status }
  );
}
```

### Parameters

The returned hook has two overloads:

**Static queries (no parameters):**
- `queryCallback: (db: EnhancedKysely<Schema>) => QueryCallbackReturnType` - Function that receives the database instance and returns a query

**Parameterized queries:**
- `queryCallback: (db: EnhancedKysely<Schema>, parameters: TParams) => QueryCallbackReturnType` - Function that receives the database instance and parameters
- `parameters: TParams` - Parameters for the query (automatically memoized)

### Return Value

```typescript
{
  isLoading: boolean;    // True while query is loading
  error: Error | null;   // Any error that occurred
  result: LiveQueryResults<T> | null; // Query results with real-time updates
}
```

### Notes / Caveats

- Parameters are automatically memoized using deep comparison
- Queries update in real-time when the database changes
- The callback must return an object with `sql` and optional `parameters` properties
- Use `.compile()` on Kysely queries to get the required format

### Related Hooks

- [`useOperationalStore`](#2-useoperationalstore) - For direct database access
- [`useOperationalQuery`](#3-useoperationalquery) - Lower-level query hook

</details>

### 2. useOperationalStore()

<details>
<summary>`useOperationalStore<Schema>()`: Access the enhanced database instance directly</summary>

### Hook Name and Signature

```typescript
function useOperationalStore<Schema>(): IOperationalStore<Schema>
```

### Description

Provides direct access to the enhanced Kysely database instance with live query capabilities. Use this when you need to perform operational database operations outside of the typical query patterns.

### Usage Example

```typescript
import { useOperationalStore } from '@powerhousedao/reactor-browser/operational';

function DatabaseOperations() {
  const { db, isLoading, error } = useOperationalStore<MyDatabase>();
  
  const createUser = async (name: string, email: string) => {
    if (!db) return;
    
    // Direct database operations
    await db
      .insertInto('users')
      .values({ name, email })
      .execute();
  };
  
  if (isLoading) return <div>Database initializing...</div>;
  if (error) return <div>Database error: {error.message}</div>;
  
  return (
    <button onClick={() => createUser('John', 'john@example.com')}>
      Create User
    </button>
  );
}
```

### Parameters

- `Schema` - TypeScript type defining your database schema

### Return Value

```typescript
{
  db: EnhancedKysely<Schema> | null;    // Enhanced Kysely instance with live capabilities
  isLoading: boolean;                   // True while database is initializing
  error: Error | null;                  // Any initialization error
}
```

### Notes / Caveats

- Always check if `db` is not null before using it
- The database instance includes both Kysely methods and live query capabilities
- Use this for direct database operations like inserts, updates, and deletes
- For queries, prefer `createProcessorQuery()` which provides better optimization

### Related Hooks

- [`createProcessorQuery`](#1-createprocessorquery) - For optimized queries
- [`useOperationalQuery`](#3-useoperationalquery) - For manual query control

</details>

### 3. useOperationalQuery()

<details>
<summary>`useOperationalQuery<Schema, T, TParams>()`: Lower-level hook for manual query control</summary>

### Hook Name and Signature

```typescript
function useOperationalQuery<Schema, T, TParams>(
  queryCallback: (db: EnhancedKysely<Schema>, parameters?: TParams) => QueryCallbackReturnType,
  parameters?: TParams
): QueryResult<T>
```

### Description

Lower-level hook for creating live queries with manual control over the query callback and parameters. Most developers should use `createProcessorQuery()` instead, but this hook is useful for advanced use cases.

### Usage Example

```typescript
import { useOperationalQuery } from '@powerhousedao/reactor-browser/operational';

function UserCount() {
  const { result, isLoading, error } = useOperationalQuery<MyDatabase, { count: number }>(
    (db) => {
      return db
        .selectFrom('users')
        .select(db.fn.count('id').as('count'))
        .compile();
    }
  );
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return <div>User count: {result?.rows[0]?.count ?? 0}</div>;
}
```

### Parameters

- `queryCallback` - Function that receives the database instance and optional parameters
- `parameters` - Optional parameters for the query

### Return Value

```typescript
{
  result: LiveQueryResults<T> | null;  // Live query results
  isLoading: boolean;                  // Combined loading state
  error: Error | null;                 // Any error that occurred
}
```

### Notes / Caveats

- This hook doesn't include automatic parameter memoization
- Use `createProcessorQuery()` for better developer experience and optimization
- Useful for cases where you need manual control over the query lifecycle

### Related Hooks

- [`createProcessorQuery`](#1-createprocessorquery) - Recommended higher-level API
- [`useOperationalStore`](#2-useoperationalstore) - For direct database access

</details>

## Advanced Patterns

### Working with Dynamic Parameters

<details>
<summary>How to handle parameters that change over time</summary>

### Problem

You need to create queries that update automatically when search terms, filters, or other parameters change.

### Solution

The `createProcessorQuery` hook automatically handles parameter changes and memoizes them using deep comparison:

```typescript
function useSearchResults() {
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

### Key Points

- Parameters are automatically memoized using deep comparison
- No need to wrap parameters in `useMemo`
- Query re-runs only when parameter values actually change
- Works with complex nested objects

</details>

### Custom SQL Queries

<details>
<summary>Using raw SQL instead of Kysely query builder</summary>

### Problem

You need to write complex SQL queries that are easier to express in raw SQL than using the Kysely query builder.

### Solution

You can return raw SQL queries from your callback:

```typescript
function useCustomUserStats() {
  return useTypedQuery(() => {
    return {
      sql: `
        SELECT 
          u.name, 
          COUNT(p.id) as post_count,
          MAX(p.created_at) as last_post_date
        FROM users u 
        LEFT JOIN posts p ON u.id = p.author_id 
        GROUP BY u.id, u.name
        ORDER BY post_count DESC
      `
    };
  });
}

// With parameters
function useUserPostsByDateRange(startDate: string, endDate: string) {
  return useTypedQuery(
    (db, params) => {
      return {
        sql: `
          SELECT p.*, u.name as author_name
          FROM posts p
          JOIN users u ON p.author_id = u.id
          WHERE p.created_at BETWEEN $1 AND $2
          ORDER BY p.created_at DESC
        `,
        parameters: [params.startDate, params.endDate]
      };
    },
    { startDate, endDate }
  );
}
```

### Key Points

- Return an object with `sql` and optional `parameters` properties
- Use parameterized queries ($1, $2, etc.) for dynamic values
- You can mix Kysely and raw SQL approaches in the same application

</details>

### Complex Joins and Relationships

<details>
<summary>Working with related data across multiple tables</summary>

### Problem

You need to fetch related data from multiple tables with complex relationships.

### Solution

Use Kysely's join capabilities within your query callbacks:

```typescript
function useUsersWithPosts() {
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
}

// More complex example with multiple joins and aggregations
function useUserDashboardData(userId: number) {
  return useTypedQuery(
    (db, params) => {
      return db
        .selectFrom('users')
        .leftJoin('posts', 'users.id', 'posts.author_id')
        .leftJoin('comments', 'posts.id', 'comments.post_id')
        .select([
          'users.id',
          'users.name',
          'users.email',
          db.fn.count('posts.id').as('post_count'),
          db.fn.count('comments.id').as('comment_count')
        ])
        .where('users.id', '=', params.userId)
        .groupBy(['users.id', 'users.name', 'users.email'])
        .compile();
    },
    { userId }
  );
}
```

### Key Points

- Use Kysely's join methods for related data
- Leverage aggregation functions for counts and calculations
- Type safety is maintained throughout complex queries

</details>

## Best Practices

### 1. Schema Definition

<details>
<summary>How to properly define your database schema types</summary>

Always define clear TypeScript interfaces for your database schema:

```typescript
// ✅ Good - Clear, typed schema
type AppDatabase = {
  users: {
    id: number;
    name: string;
    email: string;
    created_at: Date;
    updated_at: Date;
  };
  posts: {
    id: number;
    title: string;
    content: string;
    author_id: number;
    published: boolean;
    created_at: Date;
  };
};

// ❌ Avoid - Vague or missing types
type BadDatabase = {
  users: any;
  posts: Record<string, unknown>;
};
```

</details>

### 2. Hook Organization

<details>
<summary>How to organize your database hooks</summary>

Create focused, reusable hooks for different data access patterns:

```typescript
// ✅ Good - Focused, reusable hooks
export function useUsers() {
  return useTypedQuery(db => 
    db.selectFrom('users').selectAll().compile()
  );
}

export function useUserById(id: number) {
  return useTypedQuery(
    (db, params) => db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', params.id)
      .compile(),
    { id }
  );
}

export function useActiveUsers() {
  return useTypedQuery(db => 
    db.selectFrom('users')
      .selectAll()
      .where('active', '=', true)
      .compile()
  );
}

// ❌ Avoid - Too generic or complex
export function useEverything() {
  return useTypedQuery(db => 
    db.selectFrom('users')
      .leftJoin('posts', 'users.id', 'posts.author_id')
      .leftJoin('comments', 'posts.id', 'comments.post_id')
      .selectAll() // Too much data
      .compile()
  );
}
```

</details>

### 3. Error Handling

<details>
<summary>How to handle loading states and errors</summary>

Always handle loading and error states in your components:

```typescript
function UserList() {
  const { isLoading, error, result } = useUsers();

  // ✅ Good - Handle all states
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!result) return <NoDataMessage />;

  return (
    <ul>
      {result.rows.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}

// ❌ Avoid - Missing error handling
function BadUserList() {
  const { result } = useUsers();
  
  return (
    <ul>
      {result?.rows.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

</details>

### 4. Performance Optimization

<details>
<summary>Tips for optimal query performance</summary>

- **Keep queries focused**: Don't select unnecessary columns or join too many tables
- **Use parameters wisely**: The automatic memoization handles most cases, but avoid creating new objects unnecessarily
- **Consider query frequency**: For data that changes rarely, consider caching strategies

```typescript
// ✅ Good - Focused query
function useUserNames() {
  return useTypedQuery(db => 
    db.selectFrom('users')
      .select(['id', 'name'])  // Only what you need
      .compile()
  );
}

// ✅ Good - Stable parameters
function useUsersByStatus(status: string) {
  return useTypedQuery(
    (db, params) => db
      .selectFrom('users')
      .selectAll()
      .where('status', '=', params.status)
      .compile(),
    { status } // Simple, stable parameter
  );
}

// ❌ Avoid - Unnecessary data
function useEverythingAboutUsers() {
  return useTypedQuery(db => 
    db.selectFrom('users')
      .leftJoin('posts', 'users.id', 'posts.author_id')
      .selectAll() // Too much data
      .compile()
  );
}
```

</details>

## Common Issues and Solutions

### Query Not Updating

<details>
<summary>My query results aren't updating when I expect them to</summary>

### Problem
Your query results don't update when you expect them to, even though you've changed parameters.

### Solution
Check that your parameters are actually changing in content, not just reference:

```typescript
// ✅ Good - Parameters change in content
const [userId, setUserId] = useState(1);
const result = useUserById(userId); // Updates when userId changes

// ❌ Common mistake - Same content, different objects
const result = useTypedQuery(
  (db, params) => /* query */,
  { userId: user.id } // New object every render, but same content
);

// ✅ Better - Extract stable values
const userId = user.id;
const result = useTypedQuery(
  (db, params) => /* query */,
  { userId } // Stable parameter
);
```

### Debugging Tips
- Log your parameters to see if they're actually changing
- Check the `isLoading` state to see if queries are re-running
- Use React DevTools to inspect hook state changes

</details>

### Type Errors

<details>
<summary>Getting TypeScript errors with my queries</summary>

### Problem
TypeScript is showing errors about query return types or database schema.

### Solution
Make sure your callback returns the correct type:

```typescript
// ✅ Good - Returns QueryCallbackReturnType
const result = useTypedQuery(db => {
  return db.selectFrom('users').selectAll().compile(); // Has sql property
});

// ❌ Error - Missing .compile()
const result = useTypedQuery(db => {
  return db.selectFrom('users').selectAll(); // No sql property
});

// ✅ Good - Raw SQL format
const result = useTypedQuery(() => {
  return {
    sql: 'SELECT * FROM users',
    parameters: []
  };
});
```

</details>

### Performance Issues

<details>
<summary>My queries are running too frequently or causing lag</summary>

### Problem
Your queries are running more often than expected, causing performance issues.

### Solution
Check for unstable parameters or overly complex queries:

```typescript
// ❌ Problem - New object every render
function BadComponent({ user }) {
  const result = useTypedQuery(
    (db, params) => /* query */,
    { 
      filter: { status: 'active', dept: user.department } // New object each render
    }
  );
}

// ✅ Solution - Stable parameters
function GoodComponent({ user }) {
  const filter = useMemo(() => ({
    status: 'active',
    dept: user.department
  }), [user.department]);
  
  const result = useTypedQuery(
    (db, params) => /* query */,
    { filter }
  );
}

// ✅ Even better - Direct values
function BetterComponent({ user }) {
  const result = useTypedQuery(
    (db, params) => /* query */,
    { 
      status: 'active', 
      dept: user.department 
    }
  );
}
```

</details>

## Further Reading

- [Kysely Documentation](https://kysely.dev/) - Learn more about the query builder
- [PGlite Documentation](https://pglite.dev/) - Understanding the underlying database
- [React Hooks](/academy/APIReferences/ReactHooks) - Other available hooks in Powerhouse
- [Component Library](/academy/ComponentLibrary/DocumentEngineering) - Building UI components

## Related Hooks

- [`useDocuments`](/academy/APIReferences/ReactHooks#usedocuments) - Working with Powerhouse documents
- [`useDrives`](/academy/APIReferences/ReactHooks#usedrives) - Managing document drives
- [`useSelectedDocument`](/academy/APIReferences/ReactHooks#useselecteddocument) - Document selection state 