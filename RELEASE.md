# 🚀 Release Workflows

This document explains the two release workflows available in this monorepo.

![Release Workflow Diagram](https://raw.githubusercontent.com/powerhouse-inc/powerhouse/refs/heads/main/release-flow.png)

## 📑 Table of Contents

- [⚙️ Prerequisites](#️-prerequisites)
- [🔄 Available Workflows](#-available-workflows)
  - [📦 Release Branch (Recommended)](#1--release-branch-recommended)
    - [🎯 How It Works](#-how-it-works)
    - [🌿 Release Branches](#-release-branches)
    - [🏭 Production Releases](#-production-releases)
    - [🌳 Other Branches](#-other-branches)
    - [🔢 Semantic Versioning Logic](#-semantic-versioning-logic)
  - [⚡ Full Managed Release (Advanced)](#2--full-managed-release-advanced)
    - [🛠️ Features](#️-features)
    - [⚠️ Usage Guidelines](#️-usage-guidelines)
- [⚙️ Workflow Configuration](#️-workflow-configuration)
  - [📦 Release Branch Workflow](#-release-branch-workflow)
  - [⚡ Full Managed Release Workflow](#-full-managed-release-workflow)
- [✅ Best Practices](#-best-practices)
- [🔍 Troubleshooting](#-troubleshooting)

## ⚙️ Prerequisites

Before running the Release Branch workflow, ensure the target branch includes these changes:

1. In `nx.json`:
   - Set `projectsRelationship` to `managed`
   - Remove `releaseTagPattern`
   - 📎 Reference: [commit](https://github.com/powerhouse-inc/powerhouse/commit/dfe53faf58736422d8f9d1894a36caf592eaf58d)

2. In all package `package.json` files:
   - Add `repository` field with `type` and `url`
   - 📎 Reference: [commit](https://github.com/powerhouse-inc/powerhouse/commit/3913f1ef1174d508ea252b97297c61dc590149c8)

## 🔄 Available Workflows

### 1. 📦 Release Branch (Recommended)

This is the standard workflow for all regular releases.

#### 🎯 How It Works

##### 🌿 Release Branches
When triggered from a release branch (format: `release/<tag>/<version>`), the workflow automatically determines version and npm tag from the branch name.

Examples:
- `release/staging/1.7.8` → version: `1.7.8-staging.0`
- `release/dev/2.0.0` → version: `2.0.0-dev.0`

##### 🏭 Production Releases
Special handling for production branches:
- `release/production/x.y.z`
- `release/prod/x.y.z`

These will use the `latest` npm tag and take the version as-is.
Example: `release/production/1.2.2` → version: `1.2.2`, tag: `latest`

##### 🌳 Other Branches
For non-release branches, you can manually select the versioning strategy:

- `semantic-versioning` (default)
- `prerelease`
- `patch`
- `minor`
- `major`

**Note:** Always use `semantic-versioning` unless there's a specific reason not to.

###### 🔢 Semantic Versioning Logic
Calculates next version based on commit messages:
- Current version: `1.5.6-dev.0` + fix commit → `1.5.6-dev.1`
- Current version: `1.6.7` + fix commit → `1.6.8`

**💡 Tip:** Use `dry-run` to preview results before publishing.

### 2. ⚡ Full Managed Release (Advanced)

This is a fully customizable release workflow for specific scenarios.

#### 🛠️ Features
- Set any version manually
- Skip npm publish
- Customize tags
- More granular control

#### ⚠️ Usage Guidelines
- **Only use when absolutely necessary**
- Example use case: Aligning all package versions in `main`
- **Always run with `dry-run: true` first**

## ⚙️ Workflow Configuration

### 📦 Release Branch Workflow
```yaml
Inputs:
  version:
    type: choice
    options:
      - semantic-versioning
      - prerelease
      - patch
      - minor
      - major
  dry-run: boolean
  verbose: boolean
```

### ⚡ Full Managed Release Workflow
```yaml
Inputs:
  version: string
  tag: string
  dry-run: boolean
  verbose: boolean
  skip-publish: boolean
  publish-only: boolean
```

## ✅ Best Practices

1. **Always use Release Branch workflow** for regular releases
2. Use `dry-run` to verify changes before publishing
3. Follow semantic versioning when possible
4. Use production branches for stable releases
5. Keep release branches clean and focused

## 🔍 Troubleshooting

If you encounter issues:
1. Check the prerequisites are met
2. Verify branch naming follows conventions
3. Use `dry-run` to debug version calculations
4. Check GitHub Actions logs for detailed error messages