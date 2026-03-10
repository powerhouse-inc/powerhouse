# Working with the Reactor

:::tip
Document models are the common design pattern that is used for all documents and files.  
DocSync is a decentralized synchronization protocol that is storage agnostic.

**Document Models** are _what_ is synced and **DocSync** is _how_ document models are synced.  
But who is doing the syncing?

We call these participants **Reactors**.
:::

### Powerhouse Reactors

**What is a Reactor?**
Powerhouse Reactors are the nodes in the network that store documents, resolve conflicts and rerun operations to verify document event histories. Reactors can be configured for local storage, centralized cloud storage or on a decentralized storage network. A Reactor is essentially a storage node used in Powerhouse's framework to handle documents and traditional files. It supports multiple storage solutions, including:

- **Local Storage**: For offline or on-device access.
- **Cloud Storage**: For centralized, scalable data management.
- **Decentralized Storage**: Such as Ceramic or IPFS, enabling distributed and blockchain-based storage options.

### Core Functions of Reactors

- **Data Synchronization**: Reactors ensure that all data, whether local or distributed, remains up-to-date and consistent across the system.
- **Modular Storage Adapters**: They support integration with different storage backends depending on organizational needs.
- **Collaboration Support**: Reactors facilitate document sharing and peer-to-peer collaboration across contributors within the network.

:::tip
The DocSync protocol _sends updates from one reactor to another_ - **smashing document operations into one another** - to ensure all data is synced.
:::

A **reactor** is responsible for storing data and resolving merge conflicts.  
Editing data and submitting new operations must be done through Powerhouse's native applications (Connect, Switchboard, Fusion). Each instance of these applications contains a Reactor that is responsible for storing data and syncing data through DocSync. In other words, Powerhouse applications are how Reactors can be accessed, manipulated, steered, visualized and modified. A local Connect desktop application's reactor can therefore sync with the Reactor of a remote drive (e.g. Switchboard instance).

<img src="/img/Powerhouse Website Drive.png" alt="Powerhouse Storage Layer"/>

### Why Are Reactors Important?

They are key to ensuring the scalability and resilience of decentralized operations.
By acting as the backbone for document models in the Powerhouse framework, they enable seamless version control and event-driven updates.
Reactors provide the foundation for advanced features like real-time collaboration, history tracking, and decentralized audits.
This modular, flexible infrastructure enables organizations to build efficient and robust decentralized systems, tailored for modern network organizations

## Configuring your reactor

In addition to the choice of storage, Reactors also have other configurations.

- The **operational data** and **read models** associated with the document models inside a reactor allow to query the gathered data inside a document model or quickly visualize the crucial insights at a glance.
- **Processors** are components that receive operations and perform side effects — analytics tracking, relational database indexing, webhooks, and more. You register processor factories with the reactor, and it automatically creates processor instances for each drive.

The processor pipeline works as follows:

1. **Operations are written** — a job completes its write phase, persisting operations to storage
2. **Pre-ready read models update** — built-in read models like `DocumentView` and `DocumentIndexer` update their state
3. **`JOB_READ_READY` event fires** — signaling that the document is fully readable
4. **Post-ready read models update** — the `ProcessorManager` routes matching operations to user-defined processors via `onOperations()`

### Ordering guarantees

- **Global ordinal**: Every operation gets a monotonically increasing `ordinal` in its `OperationContext`, enabling cross-document ordering
- **Within a processor**: Operations arrive sorted by ordinal (chronological order)
- **Between processors**: Processors for the same drive execute in parallel — there is no inter-processor ordering guarantee
- **Per-document serialization**: The queue serializes execution per document, even across scopes and branches
- **Catch-up on restart**: Processors automatically replay missed operations after a restart (tracked via `ViewState` table)

If you are working with the Reactor directly or need additional information regarding its architecture you can visit: https://github.com/powerhouse-inc/powerhouse/blob/main/packages/reactor/docs/ARCHITECTURE.md
