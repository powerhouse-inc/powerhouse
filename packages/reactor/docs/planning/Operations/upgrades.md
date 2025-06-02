# Upgrades

### Summary

Document model upgrades provide a systematic approach to versioning and backward compatibility. Unlike traditional ES approaches, operations are not upcasted. Every operation must be matched and executed by a specific version of the document model.

### Version Immutability

Once a document model version is released (e.g., v.1), it becomes immutable with no further changes allowed. This guarantees stability and ensures that operations remain executable by their specific document model version.

### Development Versioning with v.next

- **v.next as Development Sandbox**: Every document model includes a special mutable version labeled `v.next` for ongoing development.

- **No Backward Compatibility Guarantees**: During development phase, `v.next` allows rapid iteration without backward compatibility constraints.

- **Initial Structure**: New document models begin with version 0 (immutable) and `v.next` (mutable).

### Version Release Cycle

When finalizing enhancements in `v.next`:

1. **Transition to Formal Release**: `v.next` becomes the next version number (e.g., `v.next` → `v.1` or `v.2`)
2. **Create New v.next**: A new `v.next` is created, mirroring the newly released version
3. **Upgrade Operation Replacement**: The upgrade operation is replaced with a placeholder for the next version upgrade
4. **Operation Copying**: All other operations from the released version are copied to new `v.next` without modifications

### Document Model Upgradability

- **No Initial State**: Documents start with empty objects as initial state
- **Bundled Operations**: Version specifications bundle operations with upgrade operations that construct initial state from previous versions
- **Version-Specific Execution**: Every document starts as `v.0` with empty object, then uses version-specific upgrade operations to transform to target versions
- **Operation-Version Matching**: Each operation must be executed by its corresponding document model version

### Upgrade Operation Structure

```tsx
// Example upgrade flow
// Documents start as v.0 with empty initial state
// First operation: upgrade to v.1 transforms empty state to v.1 structure  
// Each version contains upgrade operation to next version
// Operations are not upcasted - they execute against their specific version
```

### Version Compatibility

Documents maintain compatibility through explicit upgrade operations rather than automatic upcasting:

- **Explicit Version Targeting**: Operations target specific document model versions
- **Controlled Upgrades**: Documents can be upgraded through explicit version-specific upgrade operations
- **Version Chain Execution**: Upgrade operations form a chain from `v.0` through successive versions

### Implementation Requirements

- **Document Model Editor Support**: Must handle operations for multiple versions and execute them against correct version
- **Code Generator Updates**: Must support the versioned system with version-specific operation execution
- **NPM Package Structure**: Each document model package contains all versions and their corresponding operations
- **Version Matching**: System must match operations to their correct document model version for execution

### Scope and Versioning

- **Per-Scope Versioning**: Version changes apply per scope
- **Most Recent Version**: Latest version serves as development version
- **Version-Specific Operations**: Each version supports operations like `Mutations.v1.op()` that execute only against that version
