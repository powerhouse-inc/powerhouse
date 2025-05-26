# Setup Builder Environment

Let's set up your machine to start building your first Document Model. Don't worry if this is your first time setting up a development environment - we'll guide you through each step!

:::info
If you've already set up Git, Node, and pnpm, your most important step is to install the Powerhouse CLI with the command `pnpm install ph-cmd`. A global install is recommended if you want to use the command from any directory as a power user. In this case use `pnpm install -g ph-cmd`. The Powerhouse CLI is used to create, build, and run your Document Models and gives you direct access to a series of [Powerhouse Builder Tools](../Create/BuilderTools)
:::

The Powerhouse CLI (`ph-cmd`) is a command-line interface tool that provides essential commands for managing Powerhouse projects. You can get access to the Powerhouse Ecosystem tools by installing them globally using:
```bash
pnpm install -g ph-cmd
``` 

Key commands include:
- `ph connect` for running the Connect application locally
- `ph switchboard` or `ph reactor` for starting the API service
- `ph init` to start a new project and build a document model
- `ph help` to get an overview of all the available commands

This tool will be fundamental on your journey when creating, building, and running Document Models.

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
___

## Table of Contents
- [Prerequisites](#prerequisites)
- [Installing node.js 22](#installing-nodejs)
  - [For Windows](#for-windows)
  - [For macOS](#for-macos)
  - [For Linux (Ubuntu/Debian)](#for-linux-ubuntudebian)
- [Installing Visual Studio Code](#installing-visual-studio-code)
  - [For Windows](#for-windows-1)
  - [For macOS](#for-macos-1)
  - [For Linux (Ubuntu/Debian)](#for-linux-ubuntudebian-1)
- [Install Git](#install-git)
  - [For Windows](#for-windows-2)
  - [For macOS](#for-macos-2)
  - [For Linux (Ubuntu/Debian)](#for-linux-ubuntudebian-2)
- [Configure Git](#configure-git-all-systems)
- [Verify Installation](#verify-installation)

## Prerequisites

Before we begin building our Document Model, we need to install some software on your machine. We'll need three main tools: node.js 22, which helps us run our code, Visual Studio Code (VS Code), which is where we'll write our code, and Git, which helps us manage our code. Follow the steps below based on your computer's operating system.

### Installing node.js 22

node.js 22 is a tool that lets us run our application. Let's install it step by step.

#### For Windows:
1. **Set up PowerShell for running commands:**
   - Press the Windows key
   - Type "PowerShell"
   - Right-click on "Windows PowerShell" and select "Run as administrator"
   - In the PowerShell window, type this command and press Enter:
   ```powershell
   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
   - Type 'A' when prompted to confirm
   - You can now close this window and open PowerShell normally for the remaining steps

2. **Install node.js 22:**
   - Visit the [node.js 22 official website](https://nodejs.org/)
   - Click the big green button that says "LTS" (this means Long Term Support - it's the most stable version)
   - Once the installer downloads, double-click it to start installation
   - Click "Next" through the installation wizard, leaving all settings at their defaults

3. **Verify Installation:**
   - Open PowerShell (no need for admin mode)
   - Type these commands one at a time and press Enter after each:
   ```powershell
   node --version
   pnpm --version
   ```
   - You should see version numbers appear after each command (e.g., v18.17.0). If you do, congratulations - node.js 22 is installed!

> **Note**: If node.js 22 commands don't work in VS Code, restart VS Code to refresh environment variables.

#### For macOS:
1. **Install Homebrew:**
   - Open Terminal (press Command + Space and type "Terminal")
   - Copy and paste this command into Terminal and press Enter:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
   - Follow any additional instructions that appear

2. **Install node.js 22:**
   - In the same Terminal window, type this command and press Enter:
   ```bash
   brew install node
   ```

3. **Verify Installation:**
   - In Terminal, type these commands one at a time and press Enter after each:
   ```bash
   node --version
   pnpm --version
   ```
   - If you see version numbers, you've successfully installed node.js 22!

#### For Linux (Ubuntu/Debian):
1. **Open Terminal:**
   - Press Ctrl + Alt + T on your keyboard, or
   - Click the Activities button and type "Terminal"

2. **Update Package List:**
   ```bash
   sudo apt update
   ```

3. **Install node.js 22 and pnpm:**
   ```bash
   sudo apt install nodejs pnpm
   ```

4. **Verify Installation:**
   - Type these commands one at a time and press Enter after each:
   ```bash
   node --version
   pnpm --version
   ```
   - If you see version numbers, you're all set!

### Installing Visual Studio Code

VS Code is the editor we'll use to write our code. Here's how to install it:

#### For Windows:
1. Visit the [Visual Studio Code website](https://code.visualstudio.com/)
2. Click the blue "Download for Windows" button
3. Once the installer downloads, double-click it
4. Accept the license agreement and click "Next"
5. Leave the default installation location and click "Next"
6. In the Select Additional Tasks window, make sure "Add to PATH" is checked
7. Click "Next" and then "Install"
8. When installation is complete, click "Finish"

#### For macOS:
1. Visit the [Visual Studio Code website](https://code.visualstudio.com/)
2. Click the blue "Download for Mac" button
3. Once the .zip file downloads, double-click it to extract
4. Drag Visual Studio Code.app to the Applications folder
5. Double-click the app to launch it
6. To make VS Code available in your terminal:
   - Open VS Code
   - Press Command + Shift + P
   - Type "shell command" and select "Install 'code' command in PATH"

#### For Linux (Ubuntu/Debian):
1. Open Terminal (Ctrl + Alt + T)
2. First, update the packages list:
   ```bash
   sudo apt update
   ```
3. Install the dependencies needed to add Microsoft's repository:
   ```bash
   sudo apt install software-properties-common apt-transport-https wget
   ```
4. Import Microsoft's GPG key:
   ```bash
   wget -q https://packages.microsoft.com/keys/microsoft.asc -O- | sudo apt-key add -
   ```
5. Add the VS Code repository:
   ```bash
   sudo add-apt-repository "deb [arch=amd64] https://packages.microsoft.com/repos/vscode stable main"
   ```
6. Install VS Code:
   ```bash
   sudo apt install code
   ```
7. Once installed, you can launch VS Code by:
   - Typing `code` in the terminal, or
   - Finding it in your Applications menu

### Install Git

#### For Windows
1. Open PowerShell (press Windows key, type "PowerShell", and press Enter)
2. Visit the [Git website](https://git-scm.com/)
3. Download the latest version for Windows
4. Run the installer and use the recommended settings
5. Verify installation by opening PowerShell:
   ```powershell
   git --version
   ```

#### For macOS
1. Install using Homebrew:
   ```bash
   brew install git
   ```
2. Verify installation:
   ```bash
   git --version
   ```

#### For Linux (Ubuntu/Debian)
1. Update package list:
   ```bash
   sudo apt update
   ```
2. Install Git:
   ```bash
   sudo apt install git
   ```
3. Verify installation:
   ```bash
   git --version
   ```

### Configure Git (All Systems)

After installation, set up your identity:
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### Verify Installation

Open your terminal (command prompt) and run the following commands to verify your setup:
```bash
node --version
pnpm --version
git --version
```

You should see version numbers displayed for all commands. You're now ready to start building your first Document Model!
