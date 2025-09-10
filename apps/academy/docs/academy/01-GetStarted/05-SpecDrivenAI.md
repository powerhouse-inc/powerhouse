# Spec-Driven AI

This chapter introduces you to one of the most powerfull features of the Powerhouse development framework. 
In this *Get Started'* chapter we've been making use of strict schema definition principles to communicate the intended use case. This shared language is not only a language that bridges the gap between developer, designer and analyst but also the gap between builder and AI-agent. 

## Vision

At Powerhouse we are embracing the progress of AI assisted coding while unlocking the next level of AI control through specification driven AI control.

- Communicate your solution and intent through a structured specification framework designed for AI collaboration.
- Specifications enable precise, iterative edits, since all our specification documents are machine-readable and executable.
- Specifications offer the ability to update exact parameters and properties as your specs evolve in lock-step with your agent. 
- Specs turn fragile sandcastles into solid, editable, and maintainable functionality with predictable results, so you can deliver AI driven projects to production environments with piece of mind. 

This approach allows for the creation of editable specifications, enabling business analysts to modify details and instruct the AI to generate code based on updated specifications.
It results in composable, maintainable, and scalable functionality.

## Introducing Vetra Studio

Vetra studio functions as the orchestration hub where you as a builder assemble all the necessary specifications for your intended use-case, software solution or package. For each of the different *modules* that together form a package a specification document can be created in *Vetra Studio*. 

As Vetra Studio matures each of these specification documents will offer an interface by which you as a builder get more control over the modules that make up your package. These modules are divided in 3 categories. 

### 1. Document Models 
- **Document model specification**: Defines the structure and operations of a document model using GraphQL SDL, ensuring consistent data management and processing.

### 2. User Experiences
- **Editor specification**: Outlines the interface and functionalities of a document model editor, allowing users to interact with and modify document data.
- **Drive-app specification**: Specifies the UI and interactions for managing documents within a Drive, providing tailored views and functionalities.

### 3 Data intagrations
- **Subgraph specification**: Details the connections and relationships within a subgraph, facilitating efficient data querying and manipulation.
- **Codegen Processor Specification**: Describes the process for automatically generating code from document model specifications, ensuring alignment with intended architecture.
- **RelationalDb Processor Specification**: Defines how relational databases are structured and queried, supporting efficient data management and retrieval.


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

#### Standard Mode
```bash
ph vetra
```
In standard mode:
- Changes are processed automatically with 1-second debounce
- Multiple changes are batched and processed together
- Uses the latest document state for processing

### 2. Launch Claude with MCP

Vetra Studio integrates deeply with Claude through MCP (Model Control Protocol):

1. Start the MCP reactor:
```bash
ph mcp
```

2. Verify MCP connection:
- Check that the reactor MCP is available
- Confirm Vetra Studio shows "Connected to reactor MCP"

Key MCP Features:
- Automatic document model creation from natural language descriptions
- Smart editor generation based on document models
- Uses reactor recipes for consistent code generation
- Automatically triggers code generation when documents reach valid state

The powerhouse config includes a vetra URL for consistent project configuration across different environments.

### Integration with Custom Drives:
- Vetra supports integration with custom remote drives, allowing users to create and manage documents within these drives.
- The MCP server enables the agent to work with both existing and newly created document models.

### 3. Document Creation Workflow

#### A. Set Package Description (Required)
1. Provide a name for your package
2. Add a meaningful description
3. Confirm changes when prompted in interactive mode

#### B. Define Document Model (Required)
You can create document models in two ways:

1. **Using MCP (AI-Assisted)**
   - Describe your document needs in natural language
   - Claude will:
     - Generate appropriate schema
     - Create necessary operations
     - Implement required reducers
     - Place the document in the Vetra drive

2. **Manual Creation**
   - Define document schema with fields and types
   - Create necessary operations
   - Add required modules
   - Reference the document modeling material for detailed guidance

#### C. Add Document Editor (Required)
1. **Using MCP (AI-Assisted)**
   - Request Claude to create an editor for your document
   - Claude will:
     - Generate editor components
     - Implement necessary hooks
     - Create required UI elements

2. **Manual Creation**
   - Select your target document model
   - Add editor specification to Vetra Studio drive
   - Configure editor properties
   - The system will generate scaffolding code

#### D. Data Integrations (Coming Soon)
Support for:
- Subgraph integration
- Code generation processors
- Relational database processors

### Best Practices

1. **Working with MCP**
   - Provide clear, specific instructions
   - Review generated schemas before confirmation
   - Verify implementation details in generated code

2. **General Tips**
   - Use interactive mode during development
   - Review changes before confirmation
   - Double-check proposed next actions
   - Ask clarifying questions when needed


