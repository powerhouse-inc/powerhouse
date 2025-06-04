# 🚀 Release Workflows

This document explains the two release workflows available in this monorepo.

![Release Workflow Diagram](https://private-user-images.githubusercontent.com/148560082/446141200-727af65f-d7b4-4b8f-97f7-eebe3616daa6.png?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NDkwNjA4OTMsIm5iZiI6MTc0OTA2MDU5MywicGF0aCI6Ii8xNDg1NjAwODIvNDQ2MTQxMjAwLTcyN2FmNjVmLWQ3YjQtNGI4Zi05N2Y3LWVlYmUzNjE2ZGFhNi5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjUwNjA0JTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI1MDYwNFQxODA5NTNaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT1kNjNhZTc3Y2JjNmVhOWQ4ZDQ0MjcyZmMwMGViZmQ5OTlhODYyODUzZTkwMzg0OWY3NTI3ZTMyNjljNDQzOTUyJlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCJ9.hmVQdVCGv4sfF71_4Rwd0xkXZtgLq0xi_iadkhv5Nww)

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