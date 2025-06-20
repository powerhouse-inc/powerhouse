# Create a to-do list document

## Overview
This tutorial guides you through creating a simplified version of a 'Powerhouse project' for a **To-do List**.   
A Powerhouse project primarily consists of a document model and its editor.   
For this purpose, you'll be using Connect, our use-centric collaboration tool, locally, known as Connect in 'Studio mode'.

## Prerequisites
- Powerhouse CLI installed: `pnpm install -g ph-cmd`
- node.js 22 and pnpm installed
- Visual Studio Code (or your preferred IDE)
- Terminal/Command Prompt access

If you need help with installing the prerequisites you can visit our page [prerequisites](/academy/MasteryTrack/BuilderEnvironment/Prerequisites)

## Quick start
Create a new Powerhouse project with a single command:
```bash
ph init
```
<details>
<summary>How to use different branches</summary>

When installing or using the Powerhouse CLI commands you are able to make use of the dev & staging branches.   
These branches contain more experimental features then the latest stable release the PH CLI uses by default.   
They can be used to get access to a bugfix or features under development.

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

## Before you begin
1. Open your terminal (either your system terminal or IDE's integrated terminal)
2. Navigate to your desired project directory using:

   ```bash
   cd your-directory
   ```
3. Ensure you're in the correct directory before running the `ph init` command.  
In the terminal, you will be asked to enter the project name. Fill in the project name and press Enter.
   ```bash
    you@yourmachine:~/Powerhouse$ ph init

    ? What is the project name? ‣ <ToDoList>
    ```	

    Once the project is created, you will see the following output:
    ```bash
    Initialized empty Git repository in /Users/yourmachine/<ToDoList>/.git/
    The installation is done! 
    ```

    Navigate to the newly created project directory:
    ```bash
    cd <yourprojectname>
    ```
    Once in the project directory, run the `ph connect` command to start a local instance of the Connect application. This allows you to start your document model specification document.
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
    If you local drive is not present navigate into Settings in the bottom left corner. Settings > Danger Zone > Clear Storage.    
    Clear the storage of your localhost application as it might has an old session cached.   

4. Move into your local drive.   
Create a new document model by clicking the `DocumentModel` button, found in the 'New Document' section at the bottom of the page. 

If you've followed the steps correctly, you'll have an empty document where you can define the **'Document Specifications'**.

## Up next

In the next tutorials, you will learn how to specify, add code and build an editor for your document model and export it to be used in your Powerhouse package. 
