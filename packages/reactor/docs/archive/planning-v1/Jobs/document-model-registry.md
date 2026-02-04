# Document Model Registry

## Overview

The Document Model Registry is a core component of the Reactor's job execution system that manages document model modules and provides access to their reducers, utils, and specifications. This registry enables the JobExecutor to process actions for any registered document type. This allows the Reactor to:

- Dynamically load and access document model reducers
- Validate document types before processing
- Support extensibility for new document types
- Maintain a single source of truth for available document models

## Interface Design

### Core Registry Interface

```typescript
interface IDocumentModelRegistry {
  /**
   * Register multiple modules at once.
   *
   * @param modules Document model modules to register
   */
  registerModules(...modules: DocumentModelModule[]): void;

  /**
   * Register lazy-loaded modules asynchronously.
   *
   * @param loaders Object mapping document types to loader functions
   */
  registerModulesAsync(
    loaders: Record<string, () => Promise<DocumentModelModule>>,
  ): Promise<void>;

  /**
   * Unregister multiple document model modules at once.
   *
   * @param documentTypes The document types to unregister
   * @returns true if unregistered, false if not found
   */
  unregisterModules(...documentTypes: string[]): boolean;

  /**
   * Get a specific document model module by document type.
   *
   * @param documentType The document type identifier
   * @returns The document model module
   * @throws Error if the document type is not registered
   */
  getModule(documentType: string): DocumentModelModule;

  /**
   * Get all registered document model modules
   * @returns Array of all registered modules
   */
  getAllModules(): DocumentModelModule[];

  /**
   * Clear all registered modules
   */
  clear(): void;
}
```

### Module Access Pattern

```typescript
interface DocumentModelModule<T = any> {
  documentModel: DocumentModel;
  reducer: (document: PHDocument<T>, action: Action) => PHDocument<T>;
  utils: {
    createDocument: (initialState?: Partial<T>) => PHDocument<T>;
    // Other utility functions
  };
  specifications?: DocumentModelSpecification[];
}
```

## Registry Initialization

### Reactor Setup

```typescript
// During Reactor initialization
const registry = new DocumentModelRegistry();

// Register all available document models
registry.registerModules(
  documentModelDocumentModelModule,
  driveDocumentModelModule,
  budgetStatementModelModule,
  // ... other document models
);

// Pass registry to JobExecutor
const jobExecutor = new JobExecutor(eventBus, queue, registry, documentStorage);
```

### Testing Setup

```typescript
// In tests
const createMockRegistry = (...modules: DocumentModelModule[]) => {
  const registry = new DocumentModelRegistry();
  registry.registerModules(...modules);
  return registry;
};

// Test with specific modules
const testRegistry = createMockRegistry(documentModelDocumentModelModule);
```

## Error Handling

### Registry Errors

1. **Module Not Found**: Thrown when attempting to get an unregistered module
2. **Duplicate Registration**: Thrown when registering a module that already exists
3. **Invalid Module**: Validation errors for malformed modules

### Error Examples

```typescript
try {
  const module = registry.getModule("unknown-type");
} catch (error) {
  // Handle missing module
  logger.error(`Document type not supported: ${error.message}`);
}

try {
  registry.registerModules(module1, module2);
} catch (error) {
  // Handle duplicate registration
  logger.warn(`Module already registered: ${error.message}`);
}
```

## Migration Notes

### From Legacy System

The legacy system (base-server.ts) uses `getDocumentModelModule()` method. The registry replaces this with a more structured approach:

**Legacy:**

```typescript
const { reducer } = this.getDocumentModelModule(document.header.documentType);
```

**New Registry:**

```typescript
const module = this.registry.getModule(document.header.documentType);
const { reducer } = module;
```
