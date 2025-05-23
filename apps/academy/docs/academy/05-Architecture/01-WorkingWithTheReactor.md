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
The DocSync protocol *sends updates from one reactor to another* - **smashing document operations into one another** - to ensure all data is synced.
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
- **Listeners**, which continuously listen to any changes in a document model, help us to connect additional tools such as codegenerators and scripts to the reactors and the document models it holds

> Jump to: Configure a listener for your reactor and add a codegenerator
