# PGlite Integration

A TypeScript-first integration for PGlite providing low-level database management and state synchronization.

## Overview

This package provides the foundation for working with PGlite databases in React applications, focusing on database connection management and global state synchronization.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [usePGliteDB()](#usepglitedb)
  - [useSetPGliteDB()](#usesetpglitedb)
  - [usePGlite()](#usepglite)
- [Global State Management](#global-state-management)
- [Events](#events)
- [Re-exported Electric SQL Types](#re-exported-electric-sql-types)
- [Hook Relationships](#hook-relationships)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Key Features

- 🔄 **Global state management** with cross-component synchronization
- 🔒 **Type-safe database access** with full TypeScript support
- 📡 **Event-driven updates** for reactive state changes
- 🧠 **Automatic state persistence** through window object
- ⚡ **Low-level database control** for advanced use cases

## Quick Start

### 1. Initialize PGlite Database

```typescript
import { useSetPGliteDB } from '@powerhousedao/reactor-browser/pglite';
import { PGlite } from '@electric-sql/pglite';

function DatabaseSetup() {
  const setPGliteState = useSetPGliteDB();
  
  const initializeDatabase = async () => {
    setPGliteState({ isLoading: true });
    
    try {
      const db = new PGlite('idb://my-database');
      setPGliteState({ db, isLoading: false, error: null });
    } catch (error) {
      setPGliteState({ error: error as Error, isLoading: false });
    }
  };
  
  return <button onClick={initializeDatabase}>Initialize DB</button>;
}
```

### 2. Use Database in Components

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

## API Reference

### `usePGliteDB()`

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

### `useSetPGliteDB()`

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

### `usePGlite()`

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
  
  const resetDatabase = () => {
    setPGlite({ db: null, isLoading: false, error: null });
  };
  
  return (
    <div>
      <div>Status: {isLoading ? 'Loading' : db ? 'Ready' : 'Not connected'}</div>
      <button onClick={resetDatabase}>Reset Database</button>
    </div>
  );
}
```

## Global State Management

The hooks use global state management through the `window.powerhouse.pglite` object:

```typescript
// Global state structure
window.powerhouse.pglite = {
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

```typescript
import { PGLITE_UPDATE_EVENT } from '@powerhousedao/reactor-browser/pglite';

// Custom event handling
window.addEventListener(PGLITE_UPDATE_EVENT, () => {
  console.log('PGlite state updated');
});
```

## Re-exported Electric SQL Types

This package re-exports useful types and utilities from `@electric-sql/pglite`:

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
2. **`useSetPGliteDB()`** - Updates the PGlite state
3. **`usePGlite()`** - Combines both hooks for convenience

```typescript
// The relationship flow:
usePGliteDB() ← useSetPGliteDB() ← usePGlite()
```

## Best Practices

### 1. Initialize Database Early

Initialize the database at the application root level:

```typescript
function App() {
  const setPGliteState = useSetPGliteDB();
  
  useEffect(() => {
    const initDB = async () => {
      const db = new PGlite('idb://app-database');
      setPGliteState({ db, isLoading: false });
    };
    
    initDB();
  }, [setPGliteState]);
  
  return <AppContent />;
}
```

### 2. Handle Loading States

Always check for loading and error states:

```typescript
const { db, isLoading, error } = usePGliteDB();

if (isLoading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} />;
if (!db) return <NoConnectionMessage />;
```

### 3. Use State Setters Sparingly

Only use `useSetPGliteDB()` for initialization and error handling:

```typescript
// ✅ Good - initialization
const setPGliteState = useSetPGliteDB();
setPGliteState({ db: newDatabase, isLoading: false });

// ❌ Avoid - frequent updates
// Use higher-level hooks for queries instead
```

## Troubleshooting

### Common Issues

1. **Database not initializing**: Check that PGlite is properly installed and the database path is correct.

2. **State not updating**: Ensure you're using the `useSetPGliteDB()` hook and the `PGLITE_UPDATE_EVENT` is firing.

3. **Memory leaks**: The hooks automatically clean up event listeners, but ensure you're not creating multiple database instances.

### Debug Tips

```typescript
// Debug database state
const { db, isLoading, error } = usePGliteDB();
console.log('Database state:', { db: !!db, isLoading, error });

// Debug global state
console.log('Global PGlite state:', window.powerhouse?.pglite);
```

## For Higher-Level Database Operations

For type-safe queries and live query capabilities, use the operational layer:

```typescript
// For type-safe queries and live updates
import { useOperationalStore, createTypedQuery } from '@powerhousedao/reactor-browser/operational';
```

This package provides the foundation - the operational layer builds on top of it for everyday database operations.