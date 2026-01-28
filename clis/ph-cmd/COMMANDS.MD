# PH-CMD CLI Commands<br>

This document provides detailed information about the available commands in the PH-CMD CLI. The CLI is published as `ph-cmd` and is invoked with the `ph` command.<br><br>
The Powerhouse CLI (ph-cmd) is a command-line interface tool that provides essential commands for managing Powerhouse projects.
The tool and it's commands are fundamental for creating, building, and running Document Models as a builder in studio mode.<br>

## Table of Contents

- [Init](#init)
- [Use](#use)
- [Update](#update)
- [Setup Globals](#setup-globals)
- [Use Local](#use-local)
  <br>

## Init

Initialize a new project

### arguments

#### Name <br>

The name of your project. A new directory will be created in your current directory with this name.<br><br>
**usage:** `[name]`<br>

### options

#### Name <br>

The name of your project. A new directory will be created in your current directory with this name.<br><br>
**usage:** `--name, -n <str>`<br>

#### Package Manager <br>

Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager.<br><br>
**usage:** `--package-manager, -p <value>`<br>

#### Tag <br>

Specify the release tag to use for your project. Can be one of: "latest", "staging", or "dev".<br><br>
**usage:** `--tag, -t <value>`<br>

#### Version <br>

Specify the exact semver release version to use for your project.<br><br>
**usage:** `--version, -v <str>`<br>

#### Remote Drive <br>

Remote drive identifier.<br><br>
**usage:** `--remote-drive, -r <str>`<br>

### flags

#### Npm <br>

Use 'npm' as package manager<br><br>
**usage:** `--npm`<br>

#### Pnpm <br>

Use 'pnpm' as package manager<br><br>
**usage:** `--pnpm`<br>

#### Yarn <br>

Use 'yarn' as package manager<br><br>
**usage:** `--yarn`<br>

#### Bun <br>

Use 'bun' as package manager<br><br>
**usage:** `--bun`<br>

#### Dev <br>

Use the `dev` release tag.<br><br>
**usage:** `--dev, -d`<br>

#### Staging <br>

Use the `staging` release tag.<br><br>
**usage:** `--staging, -s`<br>

#### Help <br>

show help<br><br>
**usage:** `--help, -h`<br>

## Use

Specify the release version of Powerhouse dependencies to use.

### arguments

#### Tag <br>

Specify the release tag to use for your project. Can be one of: "latest", "staging", or "dev".<br><br>
**usage:** `[tag]`<br>

### options

#### Tag <br>

Specify the release tag to use for your project. Can be one of: "latest", "staging", or "dev".<br><br>
**usage:** `--tag, -t <value>`<br>

#### Version <br>

Specify the exact semver release version to use for your project.<br><br>
**usage:** `--version, -v <str>`<br>

### flags

#### Skip Install <br>

Skip running `install` with your package manager<br><br>
**usage:** `--skip-install, -s`<br>

#### Help <br>

show help<br><br>
**usage:** `--help, -h`<br>

## Update

Update your powerhouse dependencies to their latest tagged version

### flags

#### Skip Install <br>

Skip running `install` with your package manager<br><br>
**usage:** `--skip-install, -s`<br>

#### Help <br>

show help<br><br>
**usage:** `--help, -h`<br>

## Setup Globals

Initialize a new global project

### arguments

#### Name <br>

The name of your project. A new directory will be created in your current directory with this name.<br><br>
**usage:** `[name]`<br>

### options

#### Name <br>

The name of your project. A new directory will be created in your current directory with this name.<br><br>
**usage:** `--name, -n <str>`<br>

#### Package Manager <br>

Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager.<br><br>
**usage:** `--package-manager, -p <value>`<br>

#### Tag <br>

Specify the release tag to use for your project. Can be one of: "latest", "staging", or "dev".<br><br>
**usage:** `--tag, -t <value>`<br>

#### Version <br>

Specify the exact semver release version to use for your project.<br><br>
**usage:** `--version, -v <str>`<br>

#### Remote Drive <br>

Remote drive identifier.<br><br>
**usage:** `--remote-drive, -r <str>`<br>

### flags

#### Npm <br>

Use 'npm' as package manager<br><br>
**usage:** `--npm`<br>

#### Pnpm <br>

Use 'pnpm' as package manager<br><br>
**usage:** `--pnpm`<br>

#### Yarn <br>

Use 'yarn' as package manager<br><br>
**usage:** `--yarn`<br>

#### Bun <br>

Use 'bun' as package manager<br><br>
**usage:** `--bun`<br>

#### Dev <br>

Use the `dev` release tag.<br><br>
**usage:** `--dev, -d`<br>

#### Staging <br>

Use the `staging` release tag.<br><br>
**usage:** `--staging, -s`<br>

#### Help <br>

show help<br><br>
**usage:** `--help, -h`<br>

## Use Local

Use your local `powerhouse` monorepo dependencies the current project.

### arguments

#### Monorepo Path <br>

Path to your local powerhouse monorepo relative to this project<br><br>
**usage:** `[monorepo path]`<br>

### options

#### Path <br>

Path to your local powerhouse monorepo relative to this project<br><br>
**usage:** `--path, -p <str>`<br>

### flags

#### Skip Install <br>

Skip running `install` with `pnpm`<br><br>
**usage:** `--skip-install, -s`<br>

#### Help <br>

show help<br><br>
**usage:** `--help, -h`<br>
