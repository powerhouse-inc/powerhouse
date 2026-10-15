import { yaml } from "@tmpl/core";

// Deploys to Vetra: production on push to main, a preview per pull request.
// Studio Apps get VETRA_APP_ID set automatically; for an imported repo, create
// the App on https://vetra.io/user/apps/new and set the repository variable
// VETRA_APP_ID. Guide: https://vetra.io/docs/deploy
export const vetraWorkflowTemplate = yaml`
# Deploys to Vetra: production on push to main, a preview per pull request.
# Studio Apps get VETRA_APP_ID set automatically; for an imported repo, create
# the App on https://vetra.io/user/apps/new and set the repository variable
# VETRA_APP_ID. Guide: https://vetra.io/docs/deploy
name: Vetra

on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  id-token: write
  contents: read

concurrency:
  group: vetra-\${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  deploy:
    # Skip pull requests opened from another repository: they must not reach the
    # OIDC token. Compare full names rather than asking whether the head repo is
    # a fork, which is true for every PR when this repository is itself a fork.
    if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # The scaffolded package.json has no packageManager field, so pin pnpm.
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - uses: powerhouse-inc/vetra-deploy-action@v1
        with:
          app-id: \${{ vars.VETRA_APP_ID }}
`.raw;
