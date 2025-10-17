# Breaking Changes Best Practices Guide

This document outlines the standards and best practices for handling breaking changes in the Powerhouse monorepo, including API changes, data structure changes, and migration strategies.

## Table of Contents

- [Overview](#overview)
- [Semantic Versioning](#semantic-versioning)
- [Type 1 Checklist: API Breaking Changes](#type-1-checklist-api-breaking-changes)
- [Type 2 Checklist: Data Breaking Changes](#type-2-checklist-data-breaking-changes)
- [Type 3 Checklist: Behavioral Breaking Changes](#type-3-checklist-behavioral-breaking-changes)
- [Type 4 Checklist: Dependency Breaking Changes](#type-4-checklist-dependency-breaking-changes)
- [General Strategies](#general-strategies)
  - [Feature Flags for Gradual Rollout](#feature-flags-for-gradual-rollout)
  - [Data Migrations](#data-migrations)
- [Documentation Requirements](#documentation-requirements)

---

## Overview

Breaking changes are changes that break backward compatibility with previous versions. This guide provides explicit checklists for planning, implementing, and rolling out each type of breaking change.

### Types of Breaking Changes

This guide covers the following types of breaking changes:

- **Type 1**: API Breaking Changes (signature changes, removals, renames)
- **Type 2**: Data Breaking Changes (schema changes, field modifications)
- **Type 3**: Behavioral Breaking Changes (how APIs work without changing signatures)
- **Type 4**: Dependency Breaking Changes (upgrading major dependencies, runtime requirements)

Each type has a dedicated checklist covering:
1. **Planning Phase** - Evaluating necessity and impact
2. **Implementation Phase** - Building the change with backward compatibility
3. **Documentation Phase** - Creating migration guides and updating docs
4. **Release Phase** - Rolling out with proper communication
5. **Removal/Enforcement Phase** - Completing the transition in next major version

### General Principles

All breaking changes must follow these rules:

- ✅ **Only in major versions** - Breaking changes ONLY in `x.0.0` releases
- ✅ **Deprecate first** - Mark old APIs as deprecated before removing
- ✅ **Provide migration paths** - Clear instructions for users to upgrade
- ✅ **Give adequate notice** - Minimum 3-6 months deprecation period
- ✅ **Maintain backward compatibility** - Keep old APIs working during deprecation
- ✅ **Document thoroughly** - Update RELEASE-NOTES.md with before/after examples
- ✅ **Use feature flags for gradual rollout** - Use feature flags to control the rollout of breaking changes

## Semantic Versioning

We follow [Semantic Versioning 2.0.0](https://semver.org/) strictly:

- **MAJOR** version (`x.0.0`): Incompatible API changes (breaking changes)
- **MINOR** version (`0.x.0`): Backward-compatible new features
- **PATCH** version (`0.0.x`): Backward-compatible bug fixes

### TLDR

1. **Breaking changes MUST only be introduced in MAJOR versions**
   - Never introduce breaking changes in minor or patch versions
   - This is a hard rule with no exceptions

2. **Pre-release versions** can include breaking changes:
   - `1.0.0-alpha.1`, `1.0.0-beta.2`, `1.0.0-rc.1`
   - Use pre-release versions for testing breaking changes before the official major release
   - Clearly label all pre-release packages with appropriate npm tags (`alpha`, `beta`, `rc`)

3. **Use the automated versioning system**:
   - Leverage `@jscutlery/semver` for version bumps
   - Follow conventional commit messages (`feat:`, `fix:`, `feat!:`, `fix!:`)
   - Use `!` or `BREAKING CHANGE:` in commit messages to trigger major version bumps

---

## Type 1 Checklist: API Breaking Changes

API breaking changes include:
- Changing function signatures (parameters or return types)
- Removing functions, classes, or exports
- Renaming public APIs

### Planning Phase

- [ ] **Evaluate necessity**: Is there a backward-compatible alternative?
- [ ] **Assess impact**: How many users/packages are affected?
- [ ] **Design new API**: Create clear, well-documented new interface
- [ ] **Plan migration path**: How will users transition?
- [ ] **Set timeline**: Minimum 3 months deprecation period
- [ ] **Get team approval**: Review with team before proceeding

### Implementation Phase

- [ ] **Implement new API**: Build and test the new interface
- [ ] **Add deprecation to old API**:
```typescript
/**
   * @deprecated Since v5.0.0. Use {@link newFunction} instead.
   * This will be removed in v6.0.0.
   */
  ```
- [ ] **Add runtime warnings**: Use `logger.warn()` (not `console`)
- [ ] **Delegate old to new**: If possible, have deprecated API call new API internally
- [ ] **Write tests**: Test both old and new APIs, verify delegation
- [ ] **Update TypeScript types**: Ensure type safety for both versions

### Documentation Phase

- [ ] **Document in RELEASE-NOTES.md**: Include before/after examples
- [ ] **Create migration guide**: Step-by-step instructions with code samples
- [ ] **Update API documentation**: Update the API documentation to reflect the new API
- [ ] **Add to deprecation tracking table**: Add to the table

### Release Phase

- [ ] **Release in minor version**: Deploy with deprecation warnings (e.g., v5.1.0)
- [ ] **Communicate to users**: Announce in release notes, blog, etc.
- [ ] **Provide support**: Help users with migration questions
- [ ] **Wait deprecation period**: Wait for the deprecation period to elapse

### Removal Phase (Next Major Version)

- [ ] **Remove deprecated API**: Delete old code entirely
- [ ] **Update documentation**: Remove deprecated API from docs
- [ ] **Update CHANGELOG**: List removal in breaking changes section
- [ ] **Test thoroughly**: Ensure new API works in all scenarios
- [ ] **Release as major version**: e.g., v6.0.0

---

## Type 2 Checklist: Data Breaking Changes

Data breaking changes include:
- Modifying a storage system's data structure
- Changing a storage system's schema (requiring an alter, create, drop, etc.)

### Planning Phase

- [ ] **Evaluate necessity**: Can schema be extended instead of changed?
- [ ] **Assess data impact**: How much existing data will need migration?
- [ ] **Design new schema**: Define clear, versioned data structure
- [ ] **Plan migration strategy**: Forward and backward migration paths
- [ ] **Identify rollback needs**: Can users downgrade if needed?
- [ ] **Get team approval**: Review migration plan with team

### Implementation Phase

- [ ] **Add schema versioning**: Include / increment version in data structure
```typescript
  { header: { schemaVersion: "5.0.0" } }
  ```
- [ ] **Create migration function**: Implement transformation logic
- [ ] **Make migration idempotent**: Safe to run multiple times
- [ ] **Add validation**: Use Zod/JSON Schema to validate migrated data
- [ ] **Build migration registry**: Central list of all migrations
- [ ] **Implement auto-migration**: Migrate on load transparently
- [ ] **Create/Update migration CLI tool**: `ph migrate --from 4.0.0 --to 5.0.0`
- [ ] **Add dry-run mode**: Generally, previewing changes before applying is a good idea!

### Testing Phase

- [ ] **Test with production data samples**: Use real anonymized data
- [ ] **Test migration chains**: If there are multiple migrations, test them in sequence
- [ ] **Test backward compatibility**: Test that old code can read new data
- [ ] **Test rollback scenarios**: Test that users can safely downgrade
- [ ] **Validate output**: Test that all migrated data passes schema validation

### Documentation Phase

- [ ] **Document schema changes**: What changed and why?
- [ ] **Document transformation logic**: How is data converted?
- [ ] **Document edge cases**: Known issues or limitations
- [ ] **Create migration guide**: Step-by-step with examples
- [ ] **Document rollback procedure**: How to revert if needed
- [ ] **Add to RELEASE-NOTES.md**: Complete migration instructions

### Release Phase

- [ ] **Release migration in minor version**: Allow users to migrate early, if possible
- [ ] **Provide migration tools**: CLI and programmatic options
- [ ] **Communicate timeline**: When will old schema be unsupported?
- [ ] **Provide support**: Help users troubleshoot migrations
- [ ] **Consider gradual rollout**: Prefer feature flags

### Enforcement Phase (Next Major Version)

- [ ] **Require new schema**: Reject old schema versions
- [ ] **Remove old migration code**: Clean up obsolete migrations (optional)
- [ ] **Update documentation**: Reflect current schema only
- [ ] **Release as major version**: e.g., v6.0.0

---

## Type 3 Checklist: Behavioral Breaking Changes

Behavioral breaking changes include:
- Changing how an API works without changing its signature
- Modifying default values or behaviors
- Changing error handling or validation rules
- Altering side effects or execution order

### Planning Phase

- [ ] **Evaluate necessity**: Is the behavioral change essential?
- [ ] **Assess impact**: What code might depend on current behavior?
- [ ] **Document current behavior**: Clearly describe what changes
- [ ] **Design new behavior**: Define expected outcomes precisely
- [ ] **Plan detection strategy**: How will users know if affected?
- [ ] **Get team approval**: Review behavior change with team

### Implementation Phase

- [ ] **Implement new behavior**: Build and test thoroughly
- [ ] **Add feature flag**: Allow toggling between old and new behavior
- [ ] **Add migration mode**: Support both behaviors during transition
- [ ] **Log behavior changes**: Warn when behavior switches
- [ ] **Update error messages**: Reflect new validation rules
- [ ] **Write comprehensive tests**: Cover old and new behavior

### Documentation Phase

- [ ] **Document old behavior**: Describe what previously happened
- [ ] **Document new behavior**: Describe what now happens
- [ ] **Explain differences**: Why behavior changed, what to expect
- [ ] **Provide examples**: Before/after code samples
- [ ] **Update API docs**: Reflect new behavior in documentation
- [ ] **Add to RELEASE-NOTES.md**: Highlight behavioral changes prominently

### Release Phase

- [ ] **Release with feature flag**: Default to old behavior initially
- [ ] **Communicate change**: Announce in release notes clearly
- [ ] **Provide opt-in period**: Let users test new behavior
- [ ] **Monitor for issues**: Track problems with new behavior
- [ ] **Gather feedback**: Understand user impact
- [ ] **Adjust if needed**: Fix issues before making default

### Transition Phase

- [ ] **Switch default**: Make new behavior the default
- [ ] **Keep opt-out available**: Allow reverting to old behavior
- [ ] **Deprecate old behavior**: Announce old behavior will be removed
- [ ] **Continue monitoring**: Track issues with wider rollout

### Removal Phase (Next Major Version)

- [ ] **Remove old behavior**: Delete legacy code path
- [ ] **Remove feature flag**: Only new behavior remains
- [ ] **Update documentation**: Remove references to old behavior
- [ ] **Release as major version**: e.g., v6.0.0

---

## Type 4 Checklist: Dependency Breaking Changes

Dependency breaking changes include:
- Upgrading major dependencies (e.g., React 17 → 18)
- Removing deprecated dependencies
- Changing peer dependency requirements
- Updating minimum runtime versions (Node.js, browsers)

### Planning Phase

- [ ] **Evaluate necessity**: Why is the dependency upgrade needed?
- [ ] **Assess compatibility**: What will break for users?
- [ ] **Check ecosystem impact**: Are other dependencies compatible?
- [ ] **Plan upgrade path**: How will users upgrade?
- [ ] **Test with multiple versions**: Ensure graceful degradation if possible
- [ ] **Get team approval**: Review dependency changes with team

### Implementation Phase

- [ ] **Update dependency**: Upgrade to new version
- [ ] **Fix breaking changes**: Adapt code to new dependency API
- [ ] **Update peer dependencies**: Reflect new requirements in package.json
- [ ] **Add migration helpers**: Provide utilities to ease transition
- [ ] **Update build configuration**: Adjust for new dependency needs
- [ ] **Run full test suite**: Ensure everything works with new version

### Testing Phase

- [ ] **Test in isolation**: Verify new dependency works correctly
- [ ] **Test integration**: Ensure compatibility with other packages
- [ ] **Test user scenarios**: Simulate real-world usage
- [ ] **Test version matrix**: Test with minimum and maximum versions
- [ ] **Performance test**: Ensure no regressions
- [ ] **Security scan**: Check for vulnerabilities

### Documentation Phase

- [ ] **Update installation docs**: Reflect new requirements
- [ ] **Document breaking changes**: List what changed in dependency
- [ ] **Provide upgrade guide**: Step-by-step dependency upgrade
- [ ] **Update README**: Reflect new minimum versions
- [ ] **Update package.json**: Correct peer dependency ranges
- [ ] **Add to RELEASE-NOTES.md**: Document dependency changes

### Release Phase

- [ ] **Announce dependency change**: Give advance notice if possible
- [ ] **Release as major version**: Dependency changes are breaking
- [ ] **Monitor for issues**: Track dependency-related problems
- [ ] **Provide support**: Help users with upgrade issues
- [ ] **Consider LTS**: Support old major version if high impact

---

## General Strategies

### Feature Flags for Gradual Rollout

Feature flags allow you to deploy breaking changes while controlling exposure:

**When to use:**
- High-risk or uncertain changes
- Need real-world testing before full rollout
- Want ability to quickly roll back
- Benefit from gradual user adoption

**Implementation:**

We use OpenFeature with environment variable provider for feature flags:

```typescript
// feature-flags.ts
import { EnvVarProvider } from "@openfeature/env-var-provider";
import { OpenFeature } from "@openfeature/server-sdk";

export async function initFeatureFlags() {
  const provider = new EnvVarProvider();
  await OpenFeature.setProviderAndWait(provider);
  return OpenFeature.getClient();
}

// Define helper functions for each feature flag
export async function isNewDocumentCreationEnabled(): Promise<boolean> {
  const client = OpenFeature.getClient();
  return await client.getBooleanValue("FEATURE_NEW_DOCUMENT_CREATION", false);
}

export async function isNewProcessorFactoryEnabled(): Promise<boolean> {
  const client = OpenFeature.getClient();
  return await client.getBooleanValue("FEATURE_NEW_PROCESSOR_FACTORY", false);
}

// Use in code
if (await isNewDocumentCreationEnabled()) {
  // New implementation
} else {
  // Old implementation (deprecated)
}
```

**Environment variables:**

```bash
# .env
FEATURE_NEW_DOCUMENT_CREATION=true
FEATURE_NEW_PROCESSOR_FACTORY=false
```

**Lifecycle:**
1. **Alpha** (v5.0.0-alpha): Add flag, default `false`, opt-in only
2. **Beta** (v5.0.0-beta): Internal testing, gather feedback
3. **RC** (v5.0.0-rc): Gradual rollout, increase percentage
4. **Release** (v5.0.0): Default `true`, old behavior deprecated
5. **Next Major** (v6.0.0): Remove flag, only new behavior remains

**Best practices:**
- **Keep flags short-lived**: Remove flags in next major version after feature is stable
- **Naming convention**: Use `FEATURE_<NAME>_ENABLED` pattern for environment variables
- **Default to false**: New breaking changes should default to `false` until proven stable
- **Create helper functions**: Define `is<Feature>Enabled()` functions for each flag
- **Document each flag**: Add comments explaining what the flag controls and when it will be removed
- **Test all flag states**: Test with flag enabled and disabled in your test suite
- **Initialize early**: Call `initFeatureFlags()` during application startup
- **Handle async**: Remember that OpenFeature flag checks are async (return Promises)

### Data Migrations

TODO: Add comprehensive data migration strategies including:
- Schema versioning best practices
- Migration function patterns
- Registry and orchestration
- Automatic vs manual migration
- Rollback and recovery strategies
- Performance optimization for large datasets
- Testing migrations thoroughly
- Providing migration CLI tools

---

## Documentation Requirements

### 1. RELEASE-NOTES.md

Every breaking change MUST be documented in RELEASE-NOTES.md with:

- **Clear heading**: `### MethodName signature change`
- **Description**: What changed and why
- **Before/After examples**: Code showing old and new usage
- **Migration steps**: Step-by-step guide for users
- **Backward compatibility notes**: How long is the old API supported?

See [RELEASE-NOTES.md](../RELEASE-NOTES.md) for examples.

### 2. CHANGELOG.md

Breaking changes should be included in the automated CHANGELOG.md via conventional commits:

```bash
git commit -m "feat!: remove OperationScope enum

BREAKING CHANGE: OperationScope enum has been removed. Use string literal types instead.

Before: scope: OperationScope.Global
After: scope: 'global'
"
```

### 3. API Documentation

Update API documentation (JSDoc comments) to:

- Mark old APIs as `@deprecated`
- Include migration examples
- Link to RELEASE-NOTES.md for detailed migration guides

### 4. Migration Guides

For major breaking changes, create dedicated migration guide documents:

```
docs/migrations/
├── v4-to-v5.md
├── v5-to-v6.md
└── README.md
```

Include:
- Overview of all breaking changes in the version
- Detailed migration steps with code examples
- Common pitfalls and how to avoid them
- Troubleshooting section
- Links to relevant PRs and issues

### 5. README Updates

Update package README files to:
- Reflect new API usage in examples
- Update installation instructions if needed
- Link to migration guides for breaking changes
