import { yaml } from "@tmpl/core";

// Deploys to Vetra: production on push to main, a preview per pull request.
// Create the App on https://vetra.io/user/apps/new and set the repository
// variable VETRA_APP_ID. Guide: https://vetra.io/docs/deploy
export const vetraWorkflowTemplate = yaml`
# Deploys to Vetra: production on push to main, a preview per pull request.
# Create the App on https://vetra.io/user/apps/new and set the repository
# variable VETRA_APP_ID. Guide: https://vetra.io/docs/deploy
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
    if: github.event.pull_request.head.repo.fork != true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: powerhouse-inc/vetra-deploy-action@v1
        with:
          app-id: \${{ vars.VETRA_APP_ID }}
`.raw;
