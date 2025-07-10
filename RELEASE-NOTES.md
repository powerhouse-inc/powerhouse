# Release Changelog

## 🚀 **v3.3.0** (PRE-RELEASE)

- Significant `PHDocument` refactor.
  - Consolidating header information into the `header` field of the document. See the [PHDocument spec](./packages/reactor/docs/planning/PHDocument/index.md#header).
  - Introducing signed and unsigned documents. See the [PHDocument signing spec](./packages/reactor/docs/planning/PHDocument/signing.md).
- Processor generator updates.
  - The analytics processor template now includes a namespace and batch inserts by default.
  - Analytics factories are now in their own files, allowing for multiple factories to be generated.

### Migration Guide

- `PHDocument` changes:
  - **This version requires that document models be regenerated**. This means that you will need to run `ph generate` to regenerate the `gen` folder for document models.
  - Document metadata fields (like `id`, `slug`, `documentType`, `created`, `lastModified`, etc) have been moved to a `header` field of the document. Thus, `document.id` is now `document.header.id`.
  - `created` and `lastModified` have been renamed to `createdAtUtcIso` and `lastModifiedUtcIso` respectively.
- Processor generator updates:
  - A root processor factory is now generated in the `processors` folder. This will aggregate the collection of all processor factories. It is highly recommended to use this root factory to register all processors. Generating a new processor will put this root factory in place.

## 🚀 **v3.2.0**

✨ **Highlights**

### **Drive Analytics System**

- Introducing an analytics system for drives and documents with dedicated processors for tracking operations, changes, and usage patterns.
- Analytics data is automatically collected and stored in dedicated tables, providing insights into document lifecycle and drive activity.
- New analytics query subscriptions enable real-time monitoring of the data in your drive.

✅ **What to try:** Explore the new Drive Analytics documentation in the Academy to understand how analytics processors work and how to leverage analytics data in your applications. It currently happens though an initial analytics modal with the Sky-Atlas use case. This will later be adapted to the to-do list demo project.

### **Update of Front-end Architecture & Performance**

- Feature Preview: A new set of hooks were implemented to manage state on a more granular way and avoid unnecessary rerenders.

✅ **What to try:** Initial documentation about the hooks can be found [here](https://github.com/powerhouse-inc/powerhouse/blob/main/packages/common/state/README.md)

**Feature preview:** The new hooks are not fully integrated into Connect yet, however, they can be used in custom drive editors by wrapping the editor component with the new provider:

```diff
+import { AtomStoreProvider } from "@powerhousedao/common";

export default function Editor(props: IProps) {
  return (
+    <AtomStoreProvider reactor={props.context.reactor}>
      <DriveContextProvider value={props.context}>
        <WagmiContext>
          <BaseEditor {...props} />
        </WagmiContext>
      </DriveContextProvider>
+    </AtomStoreProvider>
  );
}
```

### 🐞 **Bug Fixes**

- Fixed drag and drop functionality in the generic drive explorer
- Improved document storage with better id/slug resolution
- Enhanced build process with better Prisma handling and external package management
- Reduced unnecessary logging and improved subscription performance with debounced refetches
- Added safer validation for document properties to prevent runtime errors
- Reimplemented the Switchboard button to open the document model subgraph

### Updates for [www.staging.academy.powerhouse](https://staging.powerhouse.academy/)

- **New:** Comprehensive Drive Analytics documentation and tutorial with practical examples
- Update of the Get Started chapter
- Update of the Mastery Track - Document Creation Chapter
- Update of the Mastery Track - Work with Data - Read & Write with the API chapter
- Update of the Mastery Track - Work with Data - Analytics Processor

## 🚀 **v3.1.0**

This release brings improvements to the **Cloud Environment Setup Flow,** a Connect build, updated PH commands

### `Ph service setup` command

- We have a simplified and optimized script to guide a builder through the setup of his cloud environment with connect & switchboard services.

✅ **What to try:** Try to run the `ph service setup` flow on a cloud instance on AWS or digital ocean and install a @powerhousedao/todo-demo-package.

[https://staging.powerhouse.academy/academy/MasteryTrack/Launch/SetupEnvironment](https://staging.powerhouse.academy/academy/MasteryTrack/Launch/SetupEnvironment)

### `ph connect build` command

- We have implemented `ph connect build` which bundles the connect app with the packages installed by the user in production mode.

---

### Configure an Allowlist and add Authorization for Switchboard

- Read how to add Authorization to your drive
  - [https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/Authorization/Authorization](https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/Authorization/Authorization)
- Or try to configure your environment
  - [https://staging.powerhouse.academy/academy/MasteryTrack/Launch/ConfigureEnvironment](https://staging.powerhouse.academy/academy/MasteryTrack/Launch/ConfigureEnvironment)
  ### It’s now possible to disable the Create New Drive button in Connect.
  - We have introduced PH_CONNECT_DISABLE_ADD_DRIVE=true/false env var in connect.
    configure your environment [https://staging.powerhouse.academy/academy/MasteryTrack/Launch/ConfigureEnvironment](https://staging.powerhouse.academy/academy/MasteryTrack/Launch/ConfigureEnvironment)
  ***
  ### Find your document scalars in the stand-alone Document-Engineering
  - [https://staging.powerhouse.academy/academy/ComponentLibrary/DocumentEngineering](https://staging.powerhouse.academy/academy/ComponentLibrary/DocumentEngineering)
  ✅ **What to try: Visit the updated** [https://storybook.powerhouse.academy](https://storybook.powerhouse.academy/?path=/docs/getting-started--readme) to see the latest scalar implementations by Dspot.
  ***
  ### Performance improvements in Connect
  - We’ve optimised the way components render & avoid rerenders which results in a faster, snappier app.
  - Optimized the initial loading of Connect for an improved UX
  ***
  ### Updates on [www.staging.academy.powerhouse](https://staging.powerhouse.academy/)
  - Academy moved to the monorepo! So you have more access to code context when writing documentation. 👌
  - We’ve updated the landing page getting you directly to the ‘Get started’ section & Tutorial
  - Still confused how to create a drive via mutations?
    ‘Configure a drive’ is now available to help you out. [https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/ConfiguringDrives](https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/ConfiguringDrives)
  - New educational content is present inside the ‘Mastery track’ guiding you through the advanced ToDoList Demo. [https://staging.powerhouse.academy/academy/MasteryTrack/DocumentModelCreation/WhatIsADocumentModel](https://staging.powerhouse.academy/academy/MasteryTrack/DocumentModelCreation/WhatIsADocumentModel)
  - The first page inside our API references chapter is now automatically updated with all the latest available commands for the Powerhouse CLI
    [https://staging.powerhouse.academy/academy/APIReferences/PowerhouseCLI](https://staging.powerhouse.academy/academy/APIReferences/PowerhouseCLI)

---

## 🚀 **v1.0.22 ⇒ v1.1.0**

[https://connect.phd/](https://staging.connect.phd/)

This release brings improvements that make it easier to **work with the Powerhouse CLI, understand available commands, and develop with greater confidence.**

✨ **Highlights**

### **Better CLI Documentation & Help**

- You’ll notice clearer help messages when you run `ph help` or `ph {command} --help` (e.g. `ph init --help`). We’ve redesigned the help output to be **more readable and useful right from your terminal.**
- Running `ph --version` now shows **additional context about your CLI installation** to help debug or verify your setup.

👉 **View the latest commands documentation here: [COMMANDS.md on GitHub](./clis/ph-cli/COMMANDS.md)
(Soon on academy too)**

✅ **What to try:** Run `ph help` or `ph init --help` and see the improved help output. Check out the online docs if you prefer reading in markdown!

---

### **Improved Project Initialization & Dependency Management**

- `ph init`, `ph setup-globals`, `ph update`, and `ph use` have **improved error handling and clearer messages** to guide you through project setup and environment switching.
- We’ll continue making these commands more interactive with the help of the `interactive-commander` library soon.
- Dependency updates to latest versions of `vite`, `vitest`, `tailwindcss` and more keep your projects aligned with latest versions.

✅ **What to try:** Run `ph update` in your project to pull in the latest compatible Powerhouse dependencies.

---

### **Improved Document Model Editing & Validation**

- We’ve made the SDL parsing and schema validation **safer and more reliable**, reducing cryptic GraphQL errors in the editor, to make document model definition a bit more reliable.
- A drive editor refactor for `DriveEditorContainer` and `DriveExplorer` inside Drive Explorer nowsupport dynamic document model and editor module injection. Giving you a smoother custom drive editor experience.

✅ **What to try:** Open a document in Studio mode and test schema edits or validation—error handling should feel more predictable/not brick your document model.

---

### **Cleaner Drive Deletion Across Storages**

- Removing a drive from your local storage, filesystem, or browser storage is now **more consistent and reliable.** You now have unified drive deletion behavior across `BrowserStorage`, `FilesystemStorage`, and `MemoryStorage` to ensure consistent data cleanup.
- You can now delete a drive and **immediately recreate a new one with the same ID and slug without issues.**

✅ **What to try:** Delete a drive and re-add it with the same ID to confirm a clean reset.

### 🐞 **Bug Fixes**

- Resolved an issue where `ph add` didn’t properly clean up installed packages.
- Fixed missing type imports and inconsistencies in CLI command modules.
- Addressed redundant drive deletion logic across storage layers.

**Complete Changelog & published package version can be found here:**

- An overview of the complete changelog of the past weeks can be found here!: https://github.com/powerhouse-inc/powerhouse/commit/e665c1e53dbcbbf7a7a701266522152b9c767f95. (There might be an opportunity here for the other teams to start communicating about their releases too as we are slowly gaining momentum !)

---

**Several updates for:** [https://staging.academy.powerhouse/](https://staging.academy.powerhouse/) 📖

- Added page: Setup environment & deployment guide
- Added page: Working with the Supergraph
- Added WIP page: Reusable component & Design System
- Added ph recipes: Editor creation, Supergraphs vs Subgraphs
- Updated Page: Publish packages & Run on cloud server
- Updated Page: Editor & Drive explorer creation
- Starting general spellcheck & consistency in terminology!

Thank you <3
