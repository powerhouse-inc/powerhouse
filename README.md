[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/powerhouse-inc/powerhouse)

---

# Powerhouse Monorepo

This repository uses pnpm workspaces and Nx to manage a monorepo with multiple projects and packages.

## Table of Contents

- [How to Run this Repo](#clone-repo)
- [Linking Dependencies Between Projects and Packages](#linking-deps)
- [Adding a New Package or App](#add-new-package)
- [Using Docker](#using-docker)
- [How to contribute to this project](#how-to-contribute)

## How to Run this Repo <a id="clone-repo"></a>

1. Clone the repo
   ```bash
   git clone <repo-url>
   cd <repo-directory>
   ```
2. Install the dependencies: `pnpm install`
3. Build with: `pnpm build`
4. Run a project or app: `npx nx <run_command_for_the_package_or_app> <package_or_app_name>`;

> For example, to run the Switchboard application in `/apps/switchboard/`, use `npx nx start @powerhousedao/switchboard`.

## Linking Dependencies Between Projects and Packages <a id="linking-deps"></a>

To link a dependency into a project, add it to your package.json and point the dependency version to `workspace:*`

`package.json`

```json
{
  "name": "my-new-package",
  "version": "0.0.0",
  "scripts": {
    ...
  },
  "dependencies": {
    ...
    "@pgph/pkg-a": "workspace:*", // Link to a local dependency
    "@pgph/pkg-b": "workspace:*",
    "@pgph/pkg-c": "workspace:*"
  }
}

```

## Adding a New Package or App <a id="add-new-package"></a>

### Pre-steps

1. Ensure that your package/app is properly configured to be built and published/released.
2. If deploying a package to npm, ensure that bundled files are included in the publish workflow and exclude unnecessary files (test files, config, etc.).

### Steps

1. Add your package/app into the respective folder (`packages/*` or `apps/*`).
2. Install the dependencies: `pnpm install`
3. Ensure that your package.json points to version `0.0.0`
4. Commit your changes: `git commit -m "feat(<your_new_package_name>)!: initial package setup"`
5. If pushing a new package to be deployed to npm, build the package first: `npx nx <build_command> <your_new_package_name>`
6. Perform an initial test release in your local environment: `npx nx release --first-release --projects=<your_new_package_name> --dry-run`
7. Perform the initial release in your local environment: (This step is required, otherwise releases from CI are not going to work): `npx nx release --first-release --projects=<your_new_package_name>`
   - This process will create a new tag and release in GitHub, and push the new tag to GitHub.
   - You'll be prompted if you want to create the release manually in your browser (this is going to prefill all the info for the release for you). Answer "yes" and verify in your browser that the release information is correct. Publish the release in github.
   - Finally you'll be prompted if you want to publish the release to npm: answer "yes" if this is required for your package.
8. Add your package/app to the release GitHub Action workflow: If adding a new package to be released to npm, update the `.github/worflows/release-package.yml`:

   ```yml
   ---
   name: Release Package

   on:
   workflow_dispatch:
     inputs:
     package:
       description: "Choose a package"
       required: true
       default: "packages/*"
       type: choice
       options:
         - "@pgph/pkg-a"
         - "@pgph/pkg-b"
         - "@pgph/pkg-c"
         - <add_your_new_package_name_here>
         - "packages/*"
   ```

   If adding a new app or a package requiring a special workflow, set up a new release configuration:

   ```yml

   name: Your Custom Release

   on:
   workflow_dispatch:


   jobs:
   build:
       name: ...
       runs-on: ...
       permissions:
       contents: write
       id-token: write
       steps:
       ...
       - name: git config
           shell: bash
           run: |
           git config user.name "Github Actions Bot"
           git config user.email "-"

       - name: Update pkg version
           run: npx nx release --projects=<your_new_package/app_name> --skip-publish
           shell: bash
           env:
           GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
       ...

   ```

9. Trigger future releases directly from GitHub Actions.

## Using Docker

This project can be run using Docker and Docker Compose. The `docker-compose.yml` file in the root directory defines the services and their configurations.

### Prerequisites

- Docker Engine (version 20.10.0 or later)
- Docker Compose (version 2.0.0 or later)

### Basic Usage

1. Build and start all services:

   ```bash
   docker compose up
   ```

2. Run in detached mode (background):

   ```bash
   docker compose up -d
   ```

3. View running containers:

   ```bash
   docker compose ps
   ```

4. View logs:

   ```bash
   docker compose logs -f
   ```

5. Stop all services:
   ```bash
   docker compose down
   ```

### Working with Individual Services

The `docker-compose.yml` file defines multiple services. You can work with individual services by specifying the service name:

```bash
# Start a specific service
docker compose up switchboard    # Start the Switchboard service
docker compose up connect       # Start the Connect service

# View logs for a specific service
docker compose logs -f switchboard    # View Switchboard logs
docker compose logs -f connect       # View Connect logs

# Rebuild a specific service
docker compose up -d --build switchboard    # Rebuild and start Switchboard
docker compose up -d --build connect       # Rebuild and start Connect
```

### Development Tips

- Use `docker compose up --build` to ensure you're running with the latest changes
- The `docker-compose.yml` file includes development-specific configurations
- Environment variables can be configured in the `.env` file
- For production deployments, use the `docker-compose.prod.yml` configuration

## How to contribute to this project <a id="how-to-contribute"></a>

### Packages:

Currently, only the `main` branch is enabled in this project, which means all packages are deployed to NPM from the `main` branch. To contribute to a package, please follow these steps:

1. Create a feature branch from the `main` branch:

   ```bash
   git pull origin main
   git checkout main
   git checkout -b feature/my-branch
   ```

2. Make your changes in the feature branch.
3. Once your changes are ready, commit them following the [conventional commits standard](https://www.conventionalcommits.org/en/v1.0.0/):
   - Try to keep your commits scoped (do not include files from multiple packages in a single commit).
   - Include the package scope affected by your changes in the commit message, for example:
     ```bash
     git commit -m "feat(document-model): my commit message"
     ```
4. Push your branch to GitHub and open a pull request (PR) against the `main` branch.
5. Once your PR is approved, merge it.
6. A GitHub Action will be triggered automatically after you merge your PR. This action will handle versioning and release the new version of the affected packages to NPM. Optionally, you can trigger the deployment of your package [manually](https://github.com/powerhouse-inc/powerhouse/actions/workflows/release-package-manual.yml)
