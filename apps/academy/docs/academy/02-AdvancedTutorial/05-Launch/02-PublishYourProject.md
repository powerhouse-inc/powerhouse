# Publish Your Package

This tutorial is a step by step guide tackling the following topics: 
1. the process of **building a powerhouse project** 
2. the process of **publishing it as a package**

:::info
Let's start with some **key concepts** that will help you understand the process we're going to go through in this tutorial.

- **Powerhouse Project**: The construction site of your package: A project is built with document models and editors which you will publish to NPM as a package with modules.
- **Powerhouse Modules**: The modules that are part of your project, such as the document models, editors, processors or scripts. 
- **Powerhouse Drive Apps**: Customized drive interfaces that function as a drive add and enhance or augment the functionality of your documents and workflows within the drive. 
- **Powerhouse Package**: A package is a collection of modules that are published to NPM and can be installed on a server instance or locally on your machine with help of the host apps such as Connect, Switchboard & Fusion. Organizations build packages for specific purposes or workflows.

![Key Concepts](images/keyconcepts.png)
:::


## 1. Building your project 

To start building your project with it's dedicated document models and editors we'll run the following command:

  ```bash
   ph init
   ```

<details>
<summary> Command not working? Did you install `ph-cmd`? </summary>

The Powerhouse CLI (`ph-cmd`) is a command-line interface tool that provides essential commands for managing Powerhouse projects. You can get access to the Powerhouse Ecosystem tools by installing them globally using:
```bash
pnpm install -g ph-cmd
``` 

For experimental features, use --version [version] which allows selecting a specific branch of our document-model-boilerplate. There are --dev and --staging options. Select `ph init --dev` to use the latest development version. Please be aware that this version can contain bugs and experimental features that aren't fully tested.  

Key commands include:
- `ph connect` for running the Connect application locally
- `ph switchboard` or `ph reactor` for starting the API service
- `ph init` to start a new project and build a document model
- `ph help` to get an overview of all the available commands

This tool will be fundamental on your journey when creating, building, and running document models

</details>

<details>
<summary> Got `ph-cmd` installed, but command not working? Reset your package manager cache</summary>

If you need to reset your package manager, you can run the following commands for your package manager: (pnpm, npm, yarn)

```bash
pnpm cache verify
pnpm store prune
pnpm cache clean --force

npx clear-npx-cache

npm cache verify
npm cache clean --force
npm cache verify

yarn cache list
yarn cache clean --force
yarn cache list
```
</details>

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

### 1.1. Specifying your project details

When you are creating your own project, you will be asked to name your project. 
Which will also become the package name when someone else wants to install it in a cloud environment via npm in the future.

Please feel free to navigate to the package.json file and fill in all the other available fields such as `name`, `version`, `author`, `license` and `main`.

  ```bash
{  
"name": "@your-org-ph/package-name",  #Your organization name with the -ph suffix to indicate it's a powerhouse related organization & package. 
"version": "1.0.0", 
"author": "Your Name",
"license": "AGPL-3.0-only",
"main": "index.js"  
}
```

Now that you've created your powerhouse project you are ready to generate the necessary directory and file structure to add your document models.

```bash
ph generate
```
The **generate** command will start the configuration of your powerhouse project and generates a directory with the necessary files and folders to build your project. 
These include:
- `document-models`: A folder containing the document models schemas you've defined in Connect Studio Mode.
- `editors`: A folder containing the editors you've defined in react, potentially making use of the reusable components. 
- `processors`: A folder containing the processors you might be running on your document models later on. 
- `scripts`: A folder containing the scripts you might use.
- `tests`: A folder containing your unit tests.

### 1.2. Adding Document Models, editors and unit tests

Now that you've set up your directory. 
Go ahead and add the document models you'd like to add by going through the standard document model building flow:

:::info
These steps are explained more in depth in any of our tutorials. Follow along with one of the tutorials that matches your project the most.
:::

1. Defining your Document Model **GraphQL Schema** in the document model document editor by launching the document model editor in Connect Studio Mode with the `ph connect` command.
2. Defining your Document Model **Operations** in the document model document operations editor and their graphQL counterparts.
3. Generating the scaffolding code by **exporting** the Zip file from connect and **importing** it into your project. (Save it in the directory you've created in the previous step) Run `ph generate <zipfile>`.
4. Implementing the **reducer code** and unit tests of your document models reducers.
5. Implementing the **document editors** to visualize and interact with your document models.
6. Run **unit tests** and verify the editor functionality via `ph connect` for local testing.
7. Add a **manifest file** to your project and updating your index.js file to export your modules.

### 1.3. Verifying your project
Now that we've completed our directory with the reducers, tests and editors, and your project is populated with modules we'll verify the build output and see if everything is working correctly. 

Let's **verify the package build output** with the following command:
```bash
pnpm build
```

This command will **build** the project and create a build directory with the output. The code gets optimized and minified. It optimizes the code for production and distribution so different environments can use it as a package.

This command will **start a local server** and serve the build output.
Inspect the build output and verify that the document models are working correctly.

```bash
pnpm serve (Not working yet)
```

### 1.4 Storing your project in a git repository

Now that you've verified your project is working correctly, you can store your project in a git repository.
Why? 
- So you can track the changes of your project in a remote repository and benefit from the collaboration features of git.
- So you can publish your project to the npm registry and install it on a server instance or locally on your machine.

If you stick to the layout generated by the `ph init` command, where its folders for document models and editors, you should later be able to install your package with `ph install @<your-org/package-name>` once it's published to the npm registry.

```bash
git init
git add .
git commit -m "Initial commit"
```

This will initialize a git repository and add all the files to the repository.

## 2. Publishing your project

For this step you'll need to register your organization on npm.
If you haven't already registered your organization on npm, you can do so by running the following command:
```bash
pnpm adduser
```
Create an organization on [NPM](https://www.npmjs.com/) using the naming convention: `@yourorganization-ph`
   - The `-ph` suffix indicates its a Powerhouse ecosystem package to help you and others identify it from regular NPM packages. 
   - Example: `@acme-ph`

To make sure you can differentiate between Powerhouse ecosystem packages and other packages we recommend setting up a separate npm account for your organization with the -ph suffix. **example: @yourorg-ph**
We advise you to **use a dedicated npm account for your organization and not your personal account**.

Once you've registered your organization on npm, you can now publish your project to the npm registry. 
Log in via the command line:
```bash
npm login
```
You'll be prompted for your username, password, and email in a separate browser window. 

Once you've logged in, you can configure your package.json for npm before publishing. 
If you're publishing a package under a scope (like @your-org/my-package), you might need to add the `publishConfig` to ensure it's public, otherwise scoped packages default to private:

```json
{
  "name": "@your-org/my-package",
  "version": "1.0.0",
  "main": "index.js",
  "publishConfig": {
    "access": "public"
  }
}
```

For the actual publishing step, run the following command to publish your project to the npm registry:
```bash
npm publish
```

Optionally, if you are publishing a scoped package and you want it public, run:
```bash
npm publish --access public
```

Now let's verify that the package(s) get published in the package repository, next to pre-existing packages that you might have been publishing before.

## 3. Deploying the host apps & project.
Now that we've installed all the necessary services on our server instance, we can start deploying the host apps & our packaged project from npm.

Install your project package we've published earlier on your local connect (`ph connect`) instance by running the following command:

```bash
ph install @<your-org/package-name>
```
Alternatively you can also install the package in the settings of Connect in the 'package manager' section. (Not available yet)
Where you'll be able to use the same package name as you've used in the `package.json` file and install it at the click of a button.

![package manager](images/homedesign.png)

Got this far? Congratulations on publishing your first package! 