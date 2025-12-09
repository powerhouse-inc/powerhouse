---
toc_max_heading_level: 3


---


# Vetra Studio

## Introducing Vetra Studio

- **Vetra Studio Drive**: Serves as a hub for developers to access, manage & share specification through a remote Vetra drive. It functions as the orchestration hub where you as a builder assemble all the necessary specifications for your intended use-case, software solution or package. For each of the different **modules** that together form a package a  
- **Vetra Package Library**: Store, publish and fork git repositories of packages in the Vetra Package Library.    
Visit the [Vetra Package Library here](https://vetra.io/packages) 

As Vetra Studio matures each of these specification documents will offer an interface by which you as a builder get more control over the modules that make up your package. 
For now the specification documents offer you a template for code generation. 

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

<details>
<summary>📦 Vetra Remote Drive Commands</summary>

Remote drives enable collaborative development by syncing specifications across team members.

**Key Commands:**
- `ph init --remote-drive <url>` - Create a NEW project connected to a remote drive
- `ph checkout --remote-drive <url>` - Clone an EXISTING project from a remote drive  
- `ph vetra --watch` - Start development with a preview drive for testing local changes

**Workflows:**
- **Project Owner**: `ph init --remote-drive` → Create GitHub repo → Push → `ph vetra` to configure
- **Collaborator**: `ph checkout --remote-drive` → `ph vetra` to start developing

**Preview Drive (`--watch` mode):**
- Main "Vetra" drive syncs with remote and contains stable package configuration
- "Vetra Preview" drive is created locally for testing document models before syncing
- When restarting Vetra always use `vetra --watch` so it loads local documents & editors. 

→ [Full Vetra Remote Drive Reference](/academy/APIReferences/VetraRemoteDrive)

</details>
