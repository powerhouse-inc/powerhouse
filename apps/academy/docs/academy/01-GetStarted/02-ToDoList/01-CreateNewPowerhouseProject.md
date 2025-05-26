# Create a Powerhouse Project

## Overview
This tutorial will guide you through creating a new 'Powerhouse project', which primarily consists of a document model and its editor. You'll be using Connect locally, known as 'Studio mode'.

## Prerequisites
- Powerhouse CLI installed: `pnpm install -g ph-cmd`
- node.js 22 and pnpm installed
- Visual Studio Code (or your preferred IDE)
- Terminal/Command Prompt access

## Quick Start
Create a new Powerhouse project with a single command:
```bash
ph init
```
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

## Before You Begin
1. Open your terminal (either your system terminal or VS Code's integrated terminal)
2. Navigate to your desired project directory using:

   ```bash
   cd your-directory
   ```
3. Ensure you're in the correct directory before running the `ph init` command


In the terminal, you will be asked to enter the project name. Fill in the project name and press Enter.

```bash
you@yourmachine:~/Powerhouse$ ph init

? What is the project name? ‣ <yourprojectname>
```	

Once the project is created, you will see the following output:

```bash
Initialized empty Git repository in /Users/yourmachine/<yourprojectname>/.git/
The installation is done! 
```

Navigate to the newly created project directory:

```bash
cd <yourprojectname>
```

Once you are in the project directory, you can run the `ph connect` command to instantiate a local version of the Connect application to start building your document model.

Run the following command to start the Connect application:

```bash
ph connect
```

The Connect application will start and you will see the following output:

```bash
  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.5.110:3000/
  ➜  press h + enter to show help
```

A new browser window will open and you will see the Connect application. If it doesn't open automatically, you can open it manually by navigating to `http://localhost:3000/` in your browser.

You will see your local drive and a button to create a new drive. 

:::tip
A drive is a folder to store and organize your documents in. Powerhouse offers the ability to build customized 'Drive Apps' for your documents. Think of a Drive-App as a specialized lens— it offers **different ways to visualize, organize, and interact with** the data stored within a drive, making it more intuitive and efficient for specific use cases. To learn more, visit [Building A Drive App](/docs/academy/AdvancedTutorial/BuildingUserExperiences/BuildingADriveExplorer)
:::

Move into your local drive. 
Create a new document model by clicking on the `DocumentModel` button by the "New Document" section in the bottom. 

If you followed the steps correctly, you should have an empty document model created.

In the next tutorials, you will learn how to design your document model and export it to be later used in your Powerhouse project.
