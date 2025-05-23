# Build a Drive Explorer

**Drive Explorers or Drive Apps** enhance how contributors and organizations interact with document models.   
An 'app-like' experience is created by providing a **custom interface** for working with or exploring the contents of a drive.  
:::tip 
A 'Drive Explorer or Drive App' offers a tailored application designed around its document models.   
Think of a Drive Explorer as a specialized lens—it offers **different ways to visualize, organize, and interact with** the data stored within a drive, making it more intuitive and efficient for specific use cases.
:::

### **Designed for Specific Use Cases**

Most Drive Explorers are built by organizations for specific purposes, aligning closely with a document model package or even being part of one. By integrating Drive Apps with document models, organizations can customize user experiences, streamline workflows, and maximize efficiency for their contributors.

Drive Explorers or Drive Apps **bridge the gap between raw data and usability**, unlocking the full potential of document models within the Powerhouse framework.

### **Key Features of Drive Apps**

- **Custom Views & Organization** – Drive Apps can present data in formats like Kanban boards, list views, or other structured layouts to suit different workflows.
- **Aggregated Insights** – They can provide high-level summaries of important details across document models, enabling quick decision-making.
- **Enhanced Interactivity** – Drive Apps can include widgets, data processors, or read models to process and display document data dynamically.

### **Building a Drive App**

#### The steps of our tutorial

Drive Apps provide custom interfaces for interacting with the contents of a drive. 
Here is a **quick overview** of the 3 different steps towards building a Drive App **before we dive into the Todo List Drive App**

#### Step 1. Generate the scaffolding code

Use the `generate drive editor` command to create the basic template structure for your Drive App:

```bash

ph generate --drive-editor <Drive App>
```

#### Step 2. Update the manifest file

After creating your Drive App, update the `manifest.json` file with relevant information:
The manifest file identifies your project and its components within the Powerhouse ecosystem.

#### Step 3. Customize the Drive App

Review the generated template and modify it to better suit your document model:

1. Remove unnecessary files and components
2. Add custom views specific to your data model
3. Implement specialized interactions for your use case

### About the Drive App template

The default template provides a solid foundation. It contains:
- A tree structure navigation panel
- Basic file/folder operations
- Standard layout components   

But the real power comes from tailoring the interface to your specific document models.   
 Now let's implement a specific example for a more complex todo-list then the one we've been working on. 

### Implementation Example: Todo Drive Explorer

This example demonstrates how to create a Todo Drive Explorer application using the Powerhouse platform. 
The application allows users to create and manage todo lists with a visual progress indicator.

**1. Create a Todo Document Model:**
   - Initialize a new project with `ph init` and give it a project name. 

   - Start by running Connect locally with `ph connect`

:::warning
Since you've likely already run through the [document modeling process](/docs/academy/GetStarted/ToDoList/DefineToDoListDocumentModel) of a simplified todo list, we'll offer you a **slightly more advanced** todo list below! 
:::

     - Download [todo.phdm.zip](https://github.com/powerhouse-inc/todo-drive-explorer/blob/ee63786fa8ceed71de63cd9c52f1795ad11ac403/todo.phdm.zip) from our GitHub repo. 
     - Place it in the project root of your project
     - Generate the document model:

       ```bash
       ph generate todo.phdm.zip
       ```

**2. Add the reducers code:**
   - Copy the code from [base-operations.ts](https://github.com/powerhouse-inc/todo-drive-explorer/blob/ee63786fa8ceed71de63cd9c52f1795ad11ac403/document-models/to-do/src/reducers/base-operations.ts)
   - Paste it into `document-models/to-do/src/reducers/base-operations.ts`

**3. Generate a document editor:**
   ```bash
   ph generate --editor ToDoList --document-types powerhouse/todo
   ```

**4. Add the editor code:**
   - Copy the code from [editor.tsx](https://github.com/powerhouse-inc/todo-drive-explorer/blob/ee63786fa8ceed71de63cd9c52f1795ad11ac403/editors/to-do-list/editor.tsx)
   - Paste it into `editors/to-do-list/editor.tsx`

**5. Generate a drive explorer app:**
   ```bash
   ph generate --drive-editor todo-drive-explorer
   ```

**6. Update the `powerhouse.manifest.json` file to register your Drive App with all its modules.**

  - The information of the manifest file is what the user of your package will see when installing the package:

   ```json
   {
     "name": "Todo List Package",
     "description": "A simple todo list with a dedicated Drive Explorer App",
     "category": "Productivity",
     "publisher": {
       "name": "Powerhouse",
       "url": "https://www.powerhouse.inc/"
     },
     "documentModels": [],
     "editors": [],
     "apps": [
       {
         "id": "todo-drive-explorer",
         "name": "Todo Drive App",
         "driveEditor": "todo-drive-explorer"
       }
     ],
     "subgraphs": [],
     "importScripts": []
   }
   ```

### Customize the Drive Explorer App

**1. Remove unnecessary default components:**   

- Remove default template files that won't be needed for our specific demo. If you'd like to see what the default template Drive App looks like, you can visualize it by running `ph connect`.

```bash
rm -rf editors/todo-drive-explorer/hooks
rm -rf editors/todo-drive-explorer/components/FileItemsGrid.tsx
rm -rf editors/todo-drive-explorer/components/FolderItemsGrid.tsx
rm -rf editors/todo-drive-explorer/components/FolderTree.tsx
```

**2. Create new custom components for you drive explorer app:**

   - Create and populate the following files to create our types for the todos & our components to customize the Drive Explorer.

     a. Create `editors/todo-drive-explorer/types/todo.ts`:
     - Copy the code from [todo.ts](https://github.com/powerhouse-inc/todo-drive-explorer/blob/ee63786fa8ceed71de63cd9c52f1795ad11ac403/editors/todo-drive-explorer/types/todo.ts)

     This type represents the specific data structure or state shape that the todo-drive-explorer component uses to manage or display To-Do items.

     b. Create `editors/todo-drive-explorer/components/ProgressBar.tsx`:
     - Copy the code from [ProgressBar.tsx](https://github.com/powerhouse-inc/todo-drive-explorer/blob/ee63786fa8ceed71de63cd9c52f1795ad11ac403/editors/todo-drive-explorer/components/ProgressBar.tsx)

     c. Update `editors/todo-drive-explorer/components/DriveExplorer.tsx`:
     - Copy the code from [DriveExplorer.tsx](https://github.com/powerhouse-inc/todo-drive-explorer/blob/ee63786fa8ceed71de63cd9c52f1795ad11ac403/editors/todo-drive-explorer/components/DriveExplorer.tsx)

     d. Update `editors/todo-drive-explorer/components/EditorContainer.tsx`:
     - Copy the code from [EditorContainer.tsx](https://github.com/powerhouse-inc/todo-drive-explorer/blob/ee63786fa8ceed71de63cd9c52f1795ad11ac403/editors/todo-drive-explorer/components/EditorContainer.tsx)

**3. Now that we've written the functional code for our Drive App it's time to run the application:**
   ```bash
   ph connect
   ```

   ![Todo Drive Explorer Demo](https://raw.githubusercontent.com/powerhouse-inc/todo-drive-explorer/9a87871e61460e73ddf8635fd756a0cd991306d6/demo.gif)

### **Start Building Your Own Drive Apps, Explorers or Experiences**
Congratulations on completing this tutorial! You've successfully built a custom Drive Explorer, enhancing the way users interact with document models.

Now, take a moment to think about the possibilities!
- What **unique Drive Experiences** could you create for your own projects? 
- How can you tailor interfaces and streamline workflows to unlock the full potential of your document models? 

The Powerhouse platform provides the tools. It's time to start building!

