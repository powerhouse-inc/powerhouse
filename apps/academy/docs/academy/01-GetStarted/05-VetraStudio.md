# Tool: Vetra Studio 

:::tip Important

## Vision: Specification Driven AI

In the **'Get Started'** chapter we've been making use of strict schema definition principles to communicate the intended use case of our reactive documents. 
The **schema definition language**, is a not only a shared language that bridges the gap between developer, designer and analyst but also the gap between builder and AI-agent through **specification driven AI control**.

- Communicate your solution and intent through a structured specification framework designed for AI collaboration.
- Specifications enable precise, iterative edits, since all our specification documents are machine-readable and executable.
:::

## Introducing Vetra Studio

**Vetra Studio Drive**: Serves as a hub for developers to access, manage & share specification through a remote Vetra drive.   
**Vetra Package Library**: Store, publish and fork git repositories of packages in the Vetra Package Library.    
Visit the [Vetra Package Library here](https://vetra.io/packages)

**Vetra Studio Drive** functions as the orchestration hub where you as a builder assemble all the necessary specifications for your intended use-case, software solution or package. For each of the different **modules** that together form a package a **specification document** can be created in Vetra Studio Drive. 

As Vetra Studio matures each of these specification documents will offer an interface by which you as a builder get more control over the modules that make up your package. 
For now they offer you a template for code generation. 

<figure className="image-container">
  <img
    src={require("./images/Modules.png").default}
    alt="Modules"
  />
  <figcaption>The list of available modules color coded according to the 3 categories.</figcaption>
</figure>

### Module Categories

### 1. Document Models 
- **Document model specification**: Defines the structure and operations of a document model using GraphQL SDL, ensuring consistent data management and processing.

### 2. User Experiences
- **Editor specification**: Outlines the interface and functionalities of a document model editor, allowing users to interact with and modify document data.
- **Drive-app specification**: Specifies the UI and interactions for managing documents within a Drive, providing tailored views and functionalities.

### 3. Data integrations
- **Subgraph specification**: Details the connections and relationships within a subgraph, facilitating efficient data querying and manipulation.
- **Codegen Processor Specification**: Describes the process for automatically generating code from document model specifications, ensuring alignment with intended architecture.
- **RelationalDb Processor Specification**: Defines how relational databases are structured and queried, supporting efficient data management and retrieval.

<figure className="image-container">
  <img
    src={require("./images/VetraStudioDrive.png").default}
    alt="Vetra Studio Drive"
  />
  <figcaption>The Vetra Studio Drive, a builder app that collects all of the specification of a package.</figcaption>
</figure>

### Configure a Vetra drive in your project

You can connect to a remote vetra drive instead of using the local one auto-generated when you run `ph vetra`
If you run Vetra without the `--remote-drive` option: Vetra will create a Vetra drive for you that is local and lives in your local environment / local browser storage. 
If you provide the remote drive with `--remote-drive` argument: Vetra will use this drive instead of creating a local one. the remote drive can be hosted whatever you want.
The powerhouse config includes a Vetra URL for consistent project configuration across different environments.

```vetra: {
    driveId: string;
    driveUrl: string;
};
```

Imagine you are a builder and want to work on, or continue with a set of specifications from your team mates. 
You could then add the specific remote Vetra drive to your powerhouse configuration in the `powerhouse.config.json`file to get going. 

```
"vetra": {
    "driveId": "bai-specifications",
    "driveUrl": "https://switchboard.staging.vetra.io/d/bai-specifications"
  }
```

An example of a builder team building on the Powerhouse Vetra Ecosystem and it's complementary Vetra Studio Drive specifications for the different packages be found [here](https://vetra.io/builders/bai)

## Vetra Studio Workflow

### 1. Launch Vetra Studio

You can launch Vetra Studio in two modes:

#### Interactive Mode (Recommended for Development)
```bash
ph vetra --interactive
```
In interactive mode:
- You'll receive confirmation prompts before any code generation
- Changes require explicit confirmation before being processed
- Provides better control and visibility over document changes

#### Watch Mode 

```bash
ph vetra --interactive --watch
```
In watch mode:

- Adding `--watch` to your command enables dynamic loading for document-models and editors in Vetra studio and switchboard. 
- When enabled, the system will watch for changes in these directories and reload them dynamically.

:::warning Be Aware
When you are building your document model the code can break the Vetra Studio environment. 
A full overview of the Vetra Studio commands can be found in the [Powerhouse CLI](/academy/APIReferences/PowerhouseCLI#vetra)
:::

#### Standard Mode
```bash
ph vetra
```
In standard mode:
- Changes are processed automatically with 1-second debounce
- Multiple changes are batched and processed together
- Uses the latest document state for processing

### 2. Launch Claude with Reactor-MCP

Vetra Studio integrates deeply with Claude through MCP (Model Control Protocol). This is where AI comes into the mix and you get the chance to have greater control and direction over what your llm is coding for you. 

#### 1. Start the Reactor MCP:

Make sure you are in the same directory as your project. 
Claude will automatically recognize the necessary files and MCP tools. 

```bash
claude
```

Since you're interacting with a llm it has a high capacit for interpretating your intentions. 
Any commands in the same trend will do the job. 

```bash
connect to the reactor mcp
```

#### 2. Verify MCP connection:
- Check that the Reactor MCP is available. 
- Confirm Vetra Studio shows "Connected to Reactor MCP"

```bash
Connected to MCP successfully! I can see there's a
  "vetra-4de7fa45" drive available. The reactor-mcp server is
  running and ready for document model operations.
```

-  To learn what is a [Reactor](apps/academy/docs/academy/Architecture/WorkingWithTheReactor) read the reactor article
-  To learn more about the [Reactor MCP](apps/academy/docs/academy/GetStarted/ReactorMCP) read the reactor MCP article

### Key Reactor MCP Features

- It supports automatic document model creation from natural language descriptions
- It implements a smart editor based on the underlying document models
- It automatically triggers code generation when documents reach valid state
- The MCP server enables the agent to work with both existing and newly created document models.
- Vetra supports integration with custom remote drives, allowing users to create, share and manage documents within these drives.


### 3. Vetra Studio Package Creation Workflow

#### A. Set Package Description (Required)
1. Provide a name for your package
2. Add a meaningful description
3. Add keywords to add search terms to your package
4. Confirm changes when prompted in interactive mode

#### B. Define Document Model (Required)
You can create document models in two ways:

1. **Using MCP (AI-Assisted)**
   - Describe your document needs in natural language in great detail.
   - Claude will:
     - Generate an appropriate schema
     - Create the necessary operations
     - Implement the required reducers
     - Place the document in the Vetra drive

2. **Manual Creation**
   - Define document schema with fields and types as in the **'Get Started'**
   - Create the necessary operations
   - Add the required modules to your package
   - The document model creation chapter in the Mastery track provides in depth support [here](apps/academy/docs/academy/MasteryTrack/DocumentModelCreation/SpecifyTheStateSchema)

#### C. Add Document Editor (Required)
1. **Using MCP (AI-Assisted)**
   - Request Claude to create an editor for your document. Do this with the help of a detailed description of the user interface, user experience and logic that you wish to generate. Make sure to reference operations from the document model to get the best results
   - Claude will:
     - Generate editor components
     - Implement necessary hooks
     - Create required UI elements

2. **Manual Creation**
   - Select your target document model
   - Configure the currently limited editor properties
   - Add the editor specification to Vetra Studio drive
   - The system will generate scaffolding code

#### D. Data Integrations (Coming Soon)
Support for:
- Subgraph integration
- Code generation processors
- Relational database processors

### Best Practices

**Working with MCP and claude**
   - Provide clear, specific instructions and ask for clarifying questions to be answered before code generation.
   - Review generated schemas before confirmation and work in layers instead of 'one-shotting' your code. 
   - Verify implementation details in generated code before continuing. 
   - Always double-check proposed next actions


