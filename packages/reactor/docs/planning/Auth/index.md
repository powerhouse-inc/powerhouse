# Authentication and Authorization

## Authentication

Authentication is already handled by the Renown service and will not be discussed here. Suffice it to say, that the reactor package will not be responsible for authentication.

## Authorization

We use a layered approach for authorization.

### GQL

GQL authorization will be handled by the container application, like Switchboard. This can be done using standard middleware authorization practices.

Apollo Server, for example, outlines a standard authorization approach [here](https://www.apollographql.com/docs/apollo-server/security/authentication#authorization-methods).

### Scope Access

- Access to documents is dictated by access to scopes.
- All information for authorization is stored in the associated document's `auth` scope.
- Document visibility is determined by access to the `header` scope.

#### Auth Scope Schema

```tsx
type ScopePermission = {
  // Whether the scope is readable. If false, all actions are denied. A false here takes precedence over all other permissions.
  read: boolean;

  // Actions that are explicitly allowed
  include: string[];

  // Actions that are explicitly denied (takes precedence over include)
  exclude: string[];

  // Default behavior when an action is not in include/exclude lists
  default: 'allow' | 'deny';
};

type AuthScope = {
  // Permissions per scope name (e.g., 'header', 'document')
  scopes: Record<string, ScopePermission>;
};

```

#### Composability

`AuthScope` objects are composable. This means that a `AuthScope` can have a parent `AuthScope` that is applied first.

The composition of `AuthScope` objects themselves create a new `AuthScope` object with the following rules:

- Child `read` and `default` take precedence over parent `read` and `default`.
- Parent `include`s that are in a child's `exclude` are removed from the `include`.
- Child `include`s that are in a parent's `exclude` are removed from the `exclude`.
- Remaining `include` and `exclude` are merged, respectively.

### Resolving Authorization

Since `AuthScope` objects are composable, we have to resolve the chain of `AuthScope` objects to get the final `AuthScope` object. We can do this via the `IDocumentIndexer` object.

```tsx
const graph = await indexer.findAncestors(documentId);
const authScopes = await documentView.getMany(graph.all, {
  scopes: ["auth"],
});

const combinedAuthScope = graph.aggregate(
  (parent, child) => combineAuthScopes(parent, child),
  {
    scopes: {},
  },
  documentId,
);
```

The resulting `combinedAuthScope` object can be used to determine if the current user has access to the document.

