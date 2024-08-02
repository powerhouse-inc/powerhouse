# Powerhouse Monorepo

This repository uses pnpm workspaces and Nx to manage a monorepo with multiple projects and packages.

## Table of Contents
- [How to Run this Repo](#clone-repo)
- [Linking Dependencies Between Projects and Packages](#linking-deps)
- [Adding a New Package or App](#add-new-package)


## How to Run this Repo <a id="clone-repo"></a>
1. Clone the repo
    ```bash
    git clone <repo-url>
    cd <repo-directory>
    ```
2. Install the dependencies: `pnpm install`
3. Run a project or app: `npx nx <run_command_for_the_package_or_app> <package_or_app_name>`;


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
    ...

    name: Release Package

    on:
    workflow_dispatch:
        inputs:
        package:
            description: 'Choose a package'
            required: true
            default: 'packages/*'
            type: choice
            options:
            - '@pgph/pkg-a'
            - '@pgph/pkg-b'
            - '@pgph/pkg-c'
            - <add_your_new_package_name_here>
            - 'packages/*'
    ...
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