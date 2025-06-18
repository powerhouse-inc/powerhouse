# GraphQL Namespacing: Packages and Subgraphs

## Problem: GraphQL naming conflicts in shared schemas.
## Solution: Use package-scoped subgraphs to isolate document types and queries.

### How it Works:
Each package has its own GraphQL subgraph and schema.
This ensures that teams can manage their document types independently and avoid naming clashes.

## Best Practices for Package Authors

### GraphQL Naming Conventions in Packages

#### Prefixes:

Consider prefixing your types, queries, and mutations with the document name or package name.
Example:
Prefixed: getInvoiceDocument, InvoiceStatusEnum
Unprefixed (if unambiguous): getUser, StatusEnum

#### Handling Enums and Scalars:

Use unique names for shared types (e.g., FinanceStatusEnum, HRStatusEnum) to avoid clashes.
Flexibility:

Package authors can choose between:
- Short names (for small, isolated packages).
- Prefixed names (for larger or more complex packages).

### Schema Generation & Debugging

#### Dynamic Schema Generation:

Automatic Schema Generation:

The system dynamically generates GraphQL schemas for read models.
These schemas are now exported (not just kept in memory) to make debugging easier.

#### Debugging Tip:

When creating or modifying document types, use the exported schema to verify that:
- Queries and mutations are correctly named.
- There are no naming conflicts.
- All scalars, enums, and input types are properly namespaced.