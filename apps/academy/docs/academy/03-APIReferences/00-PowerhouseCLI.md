# Powerhouse CLI

### Installing the Powerhouse CLI 
:::tip
The Powerhouse CLI tool is the only essential tool to install on this page.   
Once you've installed it with the command below you can continue to the next steps.
:::

The Powerhouse CLI (`ph-cmd`) is a command-line interface tool that provides essential commands for managing Powerhouse projects. You can get access to the Powerhouse ecosystem tools by installing them globally using:
```bash
pnpm install -g ph-cmd
``` 

Key commands include:
- `ph connect` for running the Connect application locally
- `ph switchboard` or `ph reactor` for starting the API service
- `ph init` to start a new project and build a Document Model
- `ph help` to get an overview of all the available commands

This tool will be fundamental on your journey when creating, building, and running Document Models

<details>
<summary> How to make use of different branches? </summary>

When installing or using the Powerhouse CLI commands you are able to make use of the dev & staging branches. These branches contain more experimental features then the latest stable release the PH CLI uses by default. They can be used to get access to a bugfix or features under development.

| Command | Description |
|---------|-------------|
| **pnpm install -g ph-cmd** | Install latest stable version |
| **pnpm install -g ph-cmd@dev** | Install development version |
| **pnpm install -g ph-cmd@staging** | Install staging version |
| **ph init** | Use latest stable version of the boilerplate |
| **ph init --dev** | Use development version of the boilerplate |
| **ph init --staging** | Use staging version of the boilerplate |
| **ph use** | Switch all dependencies to latest production versions |
| **ph use dev** | Switch all dependencies to development versions |
| **ph use prod** | Switch all dependencies to production versions |

Please be aware that these versions can contain bugs and experimental features that aren't fully tested.
</details>