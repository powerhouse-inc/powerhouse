# Glossary

## General Terms
- **Powerhouse** – A network organization that provides open-source software and services to support decentralized operations for other network organizations.
- **Scalable Network Organization (SNO)** – A network organization structured according to the Powerhouse framework, designed for sustainable and scalable growth.
- **Powerhouse Ecosystem** – The overall environment of Powerhouse tools, applications (like Connect), concepts (document models, packages), and services.

## Technology & Framework
- **CQRS (Command Query Responsibility Segregation)** – A pattern that separates read and write operations to improve scalability.
- **Event Sourcing** – A method of storing system state as a sequence of immutable events rather than modifying a single record.

## Software Components
- **Reactor** – A storage node for Powerhouse documents and files with multiple storage adapters (local, cloud, decentralized).
- **Powerhouse Switchboard** – A scalable API service that aggregates and processes document data.
- **Powerhouse Fusion** – A platform front-end that hosts the public marketplace for SNO interactions.
- **Powerhouse Renown** – A decentralized authentication system managing contributor reputation.
- **Powerhouse Academy** – A training platform for onboarding and upskilling SNO contributors.
- **Connect** – The contributor's public or private workspace, serving as the entry point for individual contributors to install apps and packages for specific business solutions.
- **Powergrid** – A decentralized network of reactors that sync with each other.
- **ph-cmd (Powerhouse CLI)** – The command-line tool for Powerhouse project initialization, code generation, package management, and running local development environments (Connect Studio).
- **Connect App (Connect Studio)** – The primary Powerhouse application for defining document models, building/testing editors (in Studio mode), and collaborating on documents.
- **Document Tools** – Built-in features within Powerhouse applications (e.g., Connect) that assist with document management, inspection, and interaction, such as Operations History.
- **Operations History** – A Document Tool in Connect providing a chronological, immutable log of all operations on a document for traceability.
- **Studio mode** – The local development mode of the Connect App (`ph connect`), for real-time document model definition, editor building, and testing.
- **Renown (Login Flow)** – The Powerhouse decentralized login process using an Ethereum wallet signature to generate/retrieve a user's DID for secure, pseudonymous actions.
- **Powerhouse Switchboard (Verifier Role)** – A function of Powerhouse Switchboard that validates DIDs and credentials for operations submitted via Connect, ensuring they are authorized.

## Development & Data Modeling
- **Action Creators (for Document Operations)** – Auto-generated helper functions creating structured "action" objects for dispatching operations to a document model's reducer.
- **Actions (Document Actions)** – Typed objects representing an intent to change a document's state, dispatched to reducers, containing an operation type and input data.
- **API Integration (for Document Models)** – The capability of Document Models to connect with Switchboard API or external APIs, facilitating data exchange between Powerhouse applications and other systems.
- **Boilerplate (Powerhouse Project)** – The `ph init` command's initial project structure, providing a standard starting point for new Powerhouse packages.
- **Data Analysis (with Document Models)** – Leveraging the structured data within Document Models, often via read models, to extract insights, generate reports, and perform analytics on operational and historical data.
- **Dispatch (in Document Models)** – The act of sending an action (representing an operation) to a document model's reducer to trigger a state update.
- **Document Model Editors** – An interface or UI to a document model that allows users to create and modify the data captured by the document models.
- **Document Model Specification** – The formal definition of a document model (state, operations), created in Connect Studio (using GraphQL SDL) and exported (e.g., `.phdm.zip`) for code generation.
- **Document Models** – Structured data models that define how Powerhouse documents store and process information.
- **Document State** – The current data held by a document instance, structured according to its Document Model.
- **Document Type** – A unique string identifier (e.g., `powerhouse/todolist`) for a Document Model, used by host apps to select the correct editor/logic.
- **Drive** – A logical container in Powerhouse for storing, organizing, and managing collections of documents.
- **Drive App (Custom Drive Explorer)** – A UI application, often custom, providing tailored views and interactions with documents in a Drive.
- **Event History (Append-Only Log)** – An immutable, append-only log where every operation applied to a Powerhouse document is stored as an event. It provides a transparent audit trail and enables features like time travel debugging and state reconstruction.
- **GraphQL Scalars** – Data types used in Powerhouse document modeling (e.g., `String`, `Int`, `Currency`, `OID` for unique object IDs).
- **GraphQL Schema Definition Language (SDL) (for Document Models)** – Language used in Connect Studio to define a Document Model's data structure (state) and operations.
- **Host Applications** – Applications that use the Powerhouse framework to create and manage documents and data.
- **Input Types (GraphQL for Document Operations)** – Custom data structures in SDL detailing parameters for document operations (e.g., `AddTodoItemInput`).
- **Model-Driven Development (MDD)** – A software approach that uses high-level models to generate system logic and configurations.
- **Modules (in Document Model Editor)** – An organizational feature in Connect Studio's model editor for grouping related operations.
- **Operations (Document Operations)** – Named commands (e.g., `ADD_TODO_ITEM`) in a Document Model representing all ways to change its state, forming its event log.
- **Powerhouse Document (`.phd` file)** – Standard file extension for an exported Powerhouse document instance, containing its data and history.
- **Powerhouse Package** – A collection of document models, document model editors, and other resources that are published as a package and can be used in any of the host applications.
- **Powerhouse Project** – A collection of document models, document model editors, and other resources being build in Connect Studio.
- **Pure Functions (for Reducers)** – Principle that document model reducers must be pure (output depends only on input, no side effects) for predictable state transitions.
- **Reducers (Document Model Reducers)** – Functions implementing a Document Model's logic; for each operation, a reducer takes current state and an action, returning new state.
- **Replay Events** – The process of re-applying recorded events from a document's Event History to reconstruct or restore its state, a core capability of Event Sourcing.
- **Scalars (Design System Components)** – Reusable UI building blocks (e.g., `Checkbox`, `InputField`) from `@powerhousedao/document-engineering/scalars`, used in editors (distinct from GraphQL scalars).
- **State (Global State in Document Model)** – The primary, persisted, shared data of a document instance, managed by its reducers.
- **State (Local State in Editor)** – Temporary, UI-specific data within an editor (e.g., form inputs), not persisted in the global document state.
- **State Schema** – The component of a Document Model that defines the structure of the document, including its fields, data types, and validation rules, typically using a GraphQL-like syntax. It serves as a blueprint for how data is stored and validated.
- **Storybook (for Powerhouse Design System)** – Interactive environment for browsing and testing Powerhouse Design System UI components.
- **Strands** – A single synchronization channel that connects exactly one unit of synchronization to another, with all four parameters (drive_url, doc_id, scope, branch) set to fixed values. This allows synchronization between two distinct points of instances of a document or document drive.
- **Tailwind CSS (in Connect Studio)** – Utility CSS framework integrated into Connect Studio for styling document editors.
- **Time Travel Debugging** – A debugging technique, enabled by a document's Event History, that allows developers to reconstruct and inspect past states of the document by replaying events up to a specific point in time.
- **Type Safety (in Document Modeling)** – Powerhouse's use of auto-generated TypeScript definitions from a model's schema (SDL) to prevent data type errors in development.
- **Version Control (for Document Models)** – A planned feature for Document Models in Connect that will allow tracking of changes, comparison of different versions, and maintenance of data integrity over time, similar to version control systems for source code.

## AI & Automation
- **AI Assistants** – AI-powered contributors paired with human contributors to automate tasks and improve productivity.
- **AI Contributor Modes** – Configurable states that determine the AI assistant's behavior, permissions, and task focus.
- **Task Automation & Scaling** – The use of AI to streamline repetitive tasks, improve communications, and enhance decision-making.
- **Decentralized Identifier (DID)** – A user-controlled, globally unique ID, used in Renown to link a user's blockchain key to actions pseudonymously.
- **Immutable Updates** – A principle where data is never altered in place; operations create new data versions, vital for Powerhouse's event sourcing.
- **Type Safety (in Document Modeling)** – Powerhouse's use of auto-generated TypeScript definitions from a model's schema (SDL) to prevent data type errors in development.

## Organizational Concepts
- **Ceramic** – A decentralized network for storing verifiable data, used by Powerhouse Renown for secure credential management.
- **Decentralized Identifier (DID)** – A user-controlled, globally unique ID, used in Renown to link a user's blockchain key to actions pseudonymously.
- **Event History (Append-Only Log)** – An immutable, append-only log where every operation applied to a Powerhouse document is stored as an event. It provides a transparent audit trail and enables features like time travel debugging and state reconstruction.
- **Event-Driven Architecture (EDA)** – A software design approach where system flows are determined by events that trigger actions asynchronously.
- **Immutable Updates** – A principle where data is never altered in place; operations create new data versions, vital for Powerhouse's event sourcing.
- **Network Organization** – A group of independent contributors and teams working together towards a common purpose, relying on decentralization and resource sharing.

