# Document Synchronization Protocol

# Table of Contents

# Problem Description

Due to the decentralized nature of the Powerhouse document model, in many ways comparable to git repositories, a reliable and clear synchronization mechanism between document drives in the network will be essential for the usefulness and user experience of the system.

![*Early exploration of the pull request user flow between document drives*](Document%20Synchronization%20Protocol/Untitled.png)

*Early exploration of the pull request user flow between document drives*

The CQRS-inspired architecture on the other hand, has a natural separation built-in between write operations and read model updates. Propagating new write updates (operations) to the read models (operational database tables, analytics data, etc.) is very similar to synchronizing a remote drive instance.

![*CQRS-inspired architecture plan for Switchboard*](Document%20Synchronization%20Protocol/20230905-switchboard-architecture.png)

*CQRS-inspired architecture plan for Switchboard*

With the `Document Synchronization Protocol`, we attempt to create an elegant mechanism that can be applied to both use cases: 

1. Propagating write updates to the read models in the CQRS-like architecture.
2. Propagating document updates between drives over the network, similar to pushing and pulling changes between git repositories.

# Technical Definitions

## Operation Histories

What will be synchronized between instances is a single, indexed list of operations, i.e. an operation history. To be precise, a single **operation history** (and its associated states) is identified by a quadruple set of parameters: 

`operation_history(drive_url, document_id, scope, branch) 
 -> [(revision_idx, operation, state)]` 

Some related definitions: 

- A **drive instance** is identified by its `drive_url`.
- A **document** is identified only by its `document_id`.
- A **document instance** is identified by the `(drive_url, document_id)`. I.e. “the document in a specific location.”
- A **revision history** is identified by the operation history + revision number. A revision history maps to an array of operations with length = revision number.
    
    `revision_history(drive_url, document_id, scope, branch, revision_number) 
     -> [(revision_idx, operation, state)]` 
    
- A **revision** with a given `revision_number` is the final state of its associated revision history.

Consequently

- A document instance has an operation history for every branch of every scope that it contains.
- A document can have an instance on many drive instances, each document instance with multiple operation histories that are not necessarily “in sync”.
- The invariant relation between `revision_idx` and `revision_number` is: 
`[revision_idx] = [0, 1, .., revision_number-1]`

## Note on Drive Instances

The reason why we use `drive_url` and not `drive_id` is to remain consistent when considering the drive’s underlying drive document: 

- `drive_url` refers to a **specific drive instance in a given location**. Therefore, when two drive instances are synchronizing, they each have a different, unique `drive_url`.
- `drive_id` on the other hand, is a different way of saying “the `document_id` of the underlying drive document”, containing the list of folders, authorized users, etc. in the drive.

Therefore, when two drive instances are synchronizing, they have the same `drive_id`, because the underlying drive document is the same. Intuitively this also makes sense, because it’s “the same drive synchronized between two locations.”

## Unit of Synchronization

As mentioned before, the **unit of synchronization** that we will be working with is a single operation history, identified by the quadruple `(drive_url, doc_id, scope, branch)`.

This means that operations can be synchronized between two of these units, i.e. any pair of operation histories, but not more granular than that.

- That is, it is not possible to synchronize “only some operations of an operation history”.
- However it is possible to synchronize only a single branch within a scope, or only some scopes within a document, or two documents in a drive, and so on. So it is possible to synchronize multiple pairs of operation histories in parallel.

## Synchronization Channels

We’ll adopt a notation to indicate synchronization between pairs of synchronization units: 

 `(drive_url, doc_id, scope, branch) -> (drive_url, doc_id, scope, branch)`

We call this notation a **synchronization channel** (synchronizing between the synchronization unit(s) on the left and the one(s) on the right.)

### Example Synchronization Channels

We give some examples of synchronization channels for illustrative purposes. Not all combinations have to be supported from day one:

- We can propagate all changes from **one drive instance to another**, in order to achieve an identical copy including all documents, scopes, and document branches. (This can be useful for backup purposes.)
    
    `(drive_url_1, *, *, *) -> (drive_url_2, *, *, *)`
    
- We can propagate all changes from a **public drive instance to a local drive instance**, in order to achieve a copy including all documents, scopes, and document branches. However, in this case we limit this to the `public` scope; other scopes are not synchronized.
    
    `(drive_url_1, *, public, *) -> (drive_url_2, *, public, *)`
    
- If, however, we’re dealing with the propagation of a **shared cloud instance to a local drive instance**, we may want to include the `protected` scope too.
    
    `(drive_url_1, *, [public, protected], *) -> (drive_url_2, *, [public, protected], *)`
    
- We can also propagate all changes from a public drive instance to a local drive instance, but **limit ourselves to the main branches** to avoid downloading draft document revisions.
    
    `(drive_url_1, *, public, main) -> (drive_url_2, *, public, main)`
    
- We may want to separate our local main branch from the remote main branch by propagating changes to a `remote` branch instead:
    
    `(drive_url_1, *, public, main) -> (drive_url_2, *, public, remote)`
    

## More Terminology

Further expanding on this, we can introduce some terminology to distinguish between important synchronization scenarios.

### Types of Synchronization Channels

Synchronization channels are categorized in 3 different subtypes: 

- A **synchronization strand** is a single synchronization channel from exactly one unit of synchronization to another, meaning that all 4 parameters in the quadruple are set to a fixed value:
    
    `(drive_url_1, doc_id_1, scope_1, branch_1) -> (drive_url_2, doc_id_2, scope_2, branch_2)`
    
    Strands are important concepts because this is the most granular level on which the synchronization behavior will be defined. When we talk about “synchronizing documents” or “synchronizing drives”, we know that there will potentially be many strands involved.
    
- A **synchronization thread** is a synchronization channel that propagates changes *from one document instance to another.* It can be comprised of multiple strands.
    
    `(drive_url_1, doc_id_1, ?, ?) -> (drive_url_2, doc_id_2, ?, ?)`
    
    Threads are important concepts because they capture the notion of “synchronizing documents”. We further distinguish between single-document threads and cross-document threads. 
    
    - A **single-document synchronization thread** is a thread with `doc_id_1 = doc_id_2`. This is the default, most common use case that will typically be implied when talking about synchronization threads. This case applies when synchronizing a document between different instances / locations.
    - A **cross-document synchronization thread** is a thread with `doc_id_1 != doc_id_2`. This is a more unusual case, and a thread should be explicitly called *cross-document thread* if it applies. Cross-document threads may sometimes come in handy for copying documents or creating new documents based on a pre-defined template document.
- A **synchronization cable** is a synchronization channel with one or more threads *between two drive instances.* A synchronization cable may contain multiple threads.
    
    `(drive_url_1, ?, ?, ?) -> (drive_url_2, ?, ?, ?)`
    
    Cables are important because they capture the notion of synchronizing a selection of changes, potentially in multiple documents, pushed from one location to another. This is comparable to a github pull request. The “pull request user flow” depicted earlier essentially shows a synchronization cable + commenting functionality.
    

### Partial vs Complete Synchronization

When we talk about synchronization channels, by default we assume partial synchronization. For example:

- A **synchronization thread** between two document instances will typically not propagate all scopes and/or branches.
    - If it does synchronize *all scopes and branches*, we call this a **complete synchronization thread**.
    - A complete synchronization thread will lead to **identical document instances** once the two are in sync.
- A **synchronization cable** between two drive instances will typically not propagate all documents with all their scopes and branches in the entire drive.
    - If it does synchronize *all documents, scopes, and branches,* we call this a **complete synchronization cable.**
    - A complete synchronization cable will lead to **identical drive instances** once the two are in sync.
- Note that, contrary to threads and cables, a **synchronization strand is always complete** because it is the smallest granularity of synchronization logic. Either the synchronization units on both sides of a strand are synched in their entirety, or not at all.

### Unidirectional vs Bidirectional Synchronization

So far we have only been talking about unidirectional synchronization channels. This is the default situation and when we say “channel” without further specification, we mean “unidirectional channel.”

However we can easily introduce a notation for bidirectional channels as follows: 

`(drive_url_1, doc_id_1, scope_1, branch_1) <> (drive_url_2, doc_id_2, scope_2, branch_2)` =

`(drive_url_1, doc_id_1, scope_1, branch_1) -> (drive_url_2, doc_id_2, scope_2, branch_2)`+
`(drive_url_2, doc_id_2, scope_2, branch_2) -> (drive_url_1, doc_id_1, scope_1, branch_1)`

Note that the bidirectional notation is really just a shorthand to indicate two distinct channels that happen to be used together a lot:

- A bidirectional strand is really 2 strands in opposite directions
- A bidirectional thread is really 2 threads with all their strands in opposite directions
- A bidirectional cable is really 2 cables with all their threads’ strands in opposite directions

It is acceptable to say “the 2 channels of the bidirectional channel” meaning “the 2 opposite unidirectional channels of the bidirectional channel.”

# Sender Architecture

This section explores the data sets that are available in Connect Drive to facilitate the sender side functionality of the synchronization protocol between drives. 

While the exact format may vary, the listed data sets and their associated write and read queries have to be supported by all the Connect Drive Storage Adapters. They should therefore be kept as simple as possible.

## Synchronization Units

- Basic set of information about **all the available units of synchronization** in the Connect Drive. This data resides in the underlying drive document as it defines all the existing scopes and branches for the contained documents of the drive.
- Depending on the storage adapter, this information may be directly stored as depicted, or derived from the storage infrastructure. In any case performance needs to be considered.
- For example: a file storage adapter *may* derive drive ID and document ID from its folder structure if it consistently stores documents in `<drive>/<doc_id>.ext.zip` files. Further parameters may be extracted from the document files itself.

| sync_id | drive_id | doc_id | doc_type | scope | branch | last_updated ⬇️ | revision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 18 | 5 | 100 | maker/eaprofile | local | main | 20231216220521 | 998 |
| 10 | 5 | 100 | maker/eaprofile | public | main | 20231216220116 | 22981 |
| 12 | 5 | 103 | ph/address-book | public | main | 20231216220111 | 3 |
| 54 | 5 | 110 | maker/rwa-portfolio | public | main | 20231216220109 | 7442 |
| **53** | **5** | **109** | **maker/rwa-portfolio** | **public** | **main** | **20231216215258** | **72** |
| 20 | 5 | 78 | ph/document-model | public | main | 20231216215251 | 99 |
| 11 | 5 | 102 | maker/rwa-portfolio | protected | main | 20231216215250 | 5 |
| 19 | 5 | 102 | maker/rwa-portfolio | public | main | 20231216215239 | 122 |
| … |  |  |  |  |  |  |  |
- `(drive_id, doc_id, scope, branch)` tuples are unique.
    
    Example Synchronization Unit with ID 53 is highlighted, i.e. the main branch of the public scope of a RWA Portfolio document 109, located in drive 5. 
    
- `last_updated` and `revision` can be derived from the Document Operations data set which is defined in the next paragraph.

## Document Operations

| sync_id | revision_idx | committed | operation | params | state_hash | skip |  |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **53** | **71** | **20231216215258** | **ADD_TRANSACTION** | **{ … }** | **a1036a3700791** | 0 |  |
| 53 | 70 | 20231216215242 | ADD_TRANSACTION | { … } | 1bac54b297e2 | 0 |  |
| 53 | 69 | 20231216215240 | ADD_TRANSACTION | { … } | bb0f0563ebf7 | 2 |  |
| 53 | 68 | 20231216215240 | NOOP | { } | 64438bcc3792 | 0 |  |
| 53 | 67 | 20231216215240 | NOOP | { } | 64438bcc3792 | 0 |  |
| 53 | 66 | 20231216215235 | ADD_TRANSACTION | { … } | 64438bcc3792 | 0 |  |
| … |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |

Write operation histories, organized per synchronization unit. This is where new operations get added when the document processor decides that they are permitted and valid. 

- The data structure is generic and applies to all the different document types.
- `(sync_id, revision_idx)` tuples are unique.
- `committed` is the UTC timestamp when the operation was accepted.
- `params` is a generic JSON blob. As a result, the table is convenient for saving all document history but it’s badly adapted for read querying.

This data set, in this case represented by a SQL-like table, is the single source of truth document storage. **All other data is redundant and can be reproduced from this set + the Synchronization Units set.**

### Undoing Operations and Pruning History

Note that it’s possible for an operation to be undone later by a succeeding operation. A ‘Garbage collection process’ could eventually take out these type of operations to optimize the size of the document operations history. In the example set, operations with revision index 68 and 67 were undone by operation 69.

- `skip` is the number that indicates how many prior operations need to be undone / skipped before the current operation is applied. Usually this is 0; it is 1 if the user undid one operation before the current operation, 2 if the user undid 2 operations, etc.
- Revision index numbers are never reused. However, the values for `committed`, `operation`, `params` and `state_hash` SHOULD be retro-actively updated if possible.
    - `committed` SHOULD be set to the commit timestamp of the undoing operation (in this case 69).
    - `operation` SHOULD be set to `NOOP` with `params` empty.
    - `state_hash` SHOULD be set to the same hash as the previous operation (in this case 66), because the `NOOP` operation does not change the state by definition.
- Alternatively, the rows with revision_idx 68 and 67 CAN be deleted entirely from the table (if the storage layer allows for this, and the cost isn’t too high.)
    - The document processor can always verify that the missing operations have to be skipped because the next operation, 69, has a `skip` value of 2.
    - In the context of document synchronization, skipped operations should not be sent through the synchronization channel in the first place, if it can be avoided.
        - When synchronizing the whole operation history from scratch, after operation 66, the algorithm should send operation 69 with a `skip` value of 2. The receiver MUST use the skip value to verify that it didn’t miss any operations.
        - On the other hand, if 67 and/or 68 were already sent, no harm is done: when 69 arrives with the `skip` value of 2, the receiver MUST drop 67 and 68, change them to `NOOP` operations, or in an append-only environment: skip them at execution time.
- As such, the `skip` parameter can also be used for pruning document history.
    - In that case, an `UPDATE_STATE` operation can be added with a high skip number, for example 200, to prune 200 operations from the history.
    - The parameters of the `UPDATE_STATE` operation should then reflect the combined state change resulting from the 200 pruned operations.

## Listeners and Filters

Another piece of information that a Connect Drive instance needs to keep track of, is a list of registered Listeners and the Filters that define what operations they’re listening to. 

The data types defined here are a part of the **Drive document model’s local scope**, so it’s not synchronized between different instances of the same drive. 

```graphql
type Listener {
	listenerId: ID!
	label: String
	block: Boolean!
	system: Boolean!
	filter: ListenerFilter!
	callInfo: ListenerCallInfo
}

type ListenerCallInfo {
	transmitterType: TransmitterType
	name: String
	data: String
}
```

```graphql
enum TransmitterType {
	Internal,
	SwitchboardPush,
	PullResponder,
	SecureConnect, 
	MatrixConnect,
	RESTWebhook
}

type ListenerFilter {
	documentType: [String!]!
	documentId: [ID!]
	scope: [String!]
	branch: [String!]
}
```

The **Listeners and Filters** are the only pieces of information that have to be persisted in a data set or hardcoded in the application in order to (re)establish all the synchronization channels once they lost their state.

- If `block=true`, the listener SHOULD BE called during the Document Drive request that pushes the new operation(s) to the synchronization unit, and the request should wait at least until a time-out value is reached for the listener to finish the call logic.
    
    This will typically be used if the listener is a fairly simple read model, so that the read model can update and reach consistency with the new document state before the operation request returns.
    
- The `system` flag allows for the separation of 2 groups of listeners:
    - `system=true` for **System-managed Listeners** that are used to offer higher-level functionality for features such as document sharing, caching of remote drives and making them available offline, etc.
    - `system=false` for **User-defined Listeners** that can be used by the user as webhooks to facilitate custom notification and integration scenarios. For example, a user may want to post a message on Discord when some specific change happens.
- The `ListenerFilter` structure needs to be further refined, but this is where we indicate which documents, scopes, and branches the listener is interested in.
    - `documentType` is mandatory and can be specific or a wildcard. Examples could look like `makerdao/rwa-portfolio`, `makerdao/*`, or `*/*`.
    - `documentId` can be left undefined in which case there is no restriction and all documents that match the document type will be synchronized. Alternatively, an array of document IDs can be provided to create a synchronization cable for a set of documents.
    - `scope` can be left undefined to set up *complete* threads or cables, but should typically be set to `[public]` or `[public, protected]` for synchronization of Public Drives or Secure Cloud Drives.
    - `branch` can left undefined to synchronize all available branches, or it can for example be set to `[main]` to avoid synchronization of draft document operations.
- `callInfo` is a generic placeholder to indicate whatever data is needed for the Document Drive to call the listener. This will heavily depend on the listener implementation: it could be an API URL or simply an identifier name referencing some hard-coded runtime component.
    
    It could even be that the listener itself will poll the Connect Drive from time to time, and so it cannot be called at all. In that case, `callInfo` should be left undefined.
    

### Viewing and Configuring Listeners in Connect

![*Listeners settings page with a user-defined webhook selected (details may change)*](Document%20Synchronization%20Protocol/Untitled%201.png)

*Listeners settings page with a user-defined webhook selected (details may change)*

Both the system-managed and user-defined listeners will be available through the **Connect Settings**. The Listeners settings page will act as a technical control panel like Task Manager in Windows, or equivalent process control panels in other OSes. Users will be able to see the all the defined listeners, their synchronization status, etc. They will be able to use the interface to configure custom listeners and reset the listener cache (see further.)

## The Listener State Cache

The **Listener State Cache** keeps track of the local status of all the synchronization strands of every listener. The cache can be cleared and reconstructed if needed, and can in theory reside in memory.

| listener_id | sync_id | sync_rev | block | listener_rev | listener_status | pending_timeout |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 54 | 7442 | false | 7439 | PENDING | 20240107223205 |
| **1** | **53** | **72** | **false** | **71** | **SUCCESS** |  |
| 1 | 19 | 122 | false | 122 | SUCCESS |  |
| 2 | 54 | 7442 | true | 7441 | CONFLICT |  |
| **2** | **53** | **72** | **true** | **72** | **SUCCESS** |  |
| 2 | 19 | 122 | true | 122 | SUCCESS |  |
| … |  |  |  |  |  |  |

*Listener 2 is up-to-date for sync_id 53. Listener 1 is not.*

The procedure to reconstruct the **Listener State Cache** for a listener/sync set is as follows:

1. Clear the cache table if needed, and construct an array of **listeners** and **synchronization units** that need to be considered for refreshing:
    1. When doing a full reset, **clear the entire cache** and select **all registered listeners** and **all known synchronization units** for consideration.
    2. When adding a new listener, leave the table as is and start with **only the new listener** and **all known synchronization units** for consideration.
    3. When adding a new synchronization unit, leave the table as is and start with **all registered listeners** and **only the new synchronization unit** for consideration.
2. For each selected listener L, for each selected synchronization unit S, 
if the filter `L.filter(S)` is a match, add a new record to the **Listener State Cache** with an assumed listener revision number of 0**:**
    - listener_id = L.listenerId
    - block = L.block
    - listener_rev = 0
    - listener_status = `CREATED`
    - pending_timeout = *null*
    - sync_rev = S.revision
    - sync_id = S.id
3. Now wait for the Document Synchronization Processor to pick up on the new cache records. It will notice that Listener’s revision is behind on the Synchronization Unit’s revision and the call the listener to push any missing operations. 
    - In case the Listener was not actually out-of-sync, it will immediately confirm to the Document Synchronization Processor, and the processor will set listener_rev to the current value.
    - In case the Listener was indeed out-of-sync, it will confirm to the Document Synchronization Processor what revision it is on, and the Document Synchronization Processor will schedule the missing operations for the dispatcher.

As the procedure illustrates, rebuilding the listener state cache may be costly and time-consuming. So it is recommended to persist it throughout the course of regular operations.

# Unidirectional Synchronization Protocol

## Terminology

In order to define the synchronization protocol itself, we introduce another set of definitions and symbols to ensure that the protocol will be flexible and configurable enough to facilitate various scenarios.

### Sender vs Receiver

For the purpose of the synchronization protocol, within the context of a single unidirectional synchronization strand between two synchronization units, we look at the direction of the update flow to assign the sender and receiver roles: 

- **The Sender** (notation `S`) is defined as the side that potentially has new operations in the operation history, which need to be transferred to the Receiver. As a result, the operation history of the sender MUST NOT be changed by the synchronization process.
- **The Receiver** (notation `R`) is defined as the side that potentially has to append new operations to the operation history of its synchronization unit. The operation history of the receiver CAN change through the synchronization process.

We use the notations `S → R` or `R ← S` to indicate that the Sender is sending updates to the Receiver. Both cases are equivalent, although the first one can be used when reasoning from the Sender side (”we” are sending updates to the Receiver) while the second one can be used when reasoning from the Receiver side (”we” are receiving updates from the Sender).

Note that, in a larger context, two sides can switch roles, for example to achieve bidirectional synchronization. Side A may be the Sender first, sending its updates to side B. And then it may be the Receiver some time later, when it’s receiving updates from side B. 

### Push Updates vs Pull Updates

The second concept we’re introducing, has to do with the trigger that initiates the synchronization process. Specifically, we want to decouple the Sender / Receiver role as defined before from the initiation of the synchronization process. 

- This is important because, in a typical client/server environment, the client can call the server but not the other way around. In the context of a local Connect app, especially a desktop app, the server may not have an open line of communication to the client, or the client may be offline altogether.
- However we want to give both the client and the server the ability to fulfill both Sender and Receiver roles.

We distinguish between both aspects as defined below. The notation we’re using puts a *caron* on the side where the initial trigger is located:

- We talk about a **Push Update** if the Sender is the caller, i.e. the trigger that initiates the synchronization is located on the sender side. Notation:
    - `Š → R` (”we are pushing changes to the Receiver”) or
    - `R ← Š` (”the Sender is pushing changes to us”)
- We talk about a **Pull Update** if the Receiver is the caller, i.e. the trigger that initiates the synchronization is located on the receiver side. Notation:
    - `S → Ř` (”the Receiver is pulling changes from us”) or
    - `Ř ← S` (”we are pulling changes from the Sender”)

There are some common concepts that are related but different: 

- A **Pull (Update) Request**, as used by Github, is a message that is sent to a potential Receiver (repository), whereby the Receiver is requested to initiate a Pull Update from a given Sender (repository/branch) as defined in the request message.
- In case where a client is periodically calling the server in order to pull the latest updates, we call this **Polling**.

### Send/Process vs Process/Send

The next aspect we are considering, is on which side (most of) the “bookkeeping” happens in terms of revision comparison, detecting double or missing updates, and so on. To see why this is important, consider the following two scenarios: 

- Scenario 1 is a simple webhook (push process). The success of the webhook feature will depend on the variety of endpoints that can be called and how easy it is to integrate.
    - The user may have no or only limited control over the Receiver endpoint, or they may want to reduce the integration effort as much as possible.
    - As a result, it’s Connect on the Sender side that should do all the bookkeeping, and the listener should be configured to call the endpoint in whatever way is most convenient for the user: with a list of the newest operations, or just the latest state of the synchronization unit in question.
    - We say that Processing needs to happen before Sending; this is a **Process/Send flow**.
- Scenario 2 is one Connect Drive synchronizing with another. In this case, the priority is very different: we need to make the process as robust, fail-safe, and performant as possible.
    - The receiving drive will want to know all the details about the changes it’s being sent. What drive, document, branch and scope the change is for. What the new operations are and whether they have valid signatures. What the new revision number and state is in order to detect errors. Etc.
    - In other words, it’s the Receiver that wants to do the bookkeeping and verification. Acting almost like a blockchain node, checking the validity of every aspect of the transaction.
    - We say that Sending needs to happen before Processing; this is a **Send/Process flow**.

We adjust our notation by adding a vertical line on the side of the arrow that does the processing: 

- The **Process/Send** flow has the vertical line on the Sender side:
    - `S ↦ R` (”we’re pre-processing the changes and sending the results to the Receiver”) or
    - `R ↤ S` (”we’re receiving the pre-processed results from the Sender”)
- The **Send/Process** flow has the vertical line on the Receiver side:
    - `S ⇥ R` (”we’re sending unprocessed changes to Receiver who will post-process them”) or
    - `R ⇤ S` (”we’re receiving unprocessed changes from Sender and will post-process them”)

## Example Scenarios

- **Webhooks `Š ↦ R`**
    
    *“Our Connect Drive is pushing pre-processed changes to an external Receiver.”*
    
- **Data processing service (for example BA Labs) `S ↦ Ř` (or `S ⇥ Ř`)**
    
    *“An external Receiver is pulling pre-processed (or unprocessed) changes from our Switchboard Sender.”*
    
- **Download public drive updates (Connect ← Switchboard) `Ř ⇤ S`**
    
    *“Our Connect Drive is pulling unprocessed changes from a Switchboard Sender.”*
    
- **Push changes to a Public Drive or Secure Cloud Drive `Š ⇥ R`**
    
    *“Our Connect Drive is pushing unprocessed changes to a Switchboard Receiver.”*
    

### **Approach to** **merge conflicts for unidirectional synchronisation.**

The merging of certain operations from different instances will usually be fine, until it’s not. 
Putting changes that don’t fit ‘on top’ of all the other changes that did successfully synchronise is a ‘naive rebase’ or a pretty straight forward reshuffling of operations. 

- RWA reporting example: *An error could be shown when the assets, which name should be adjusted, have already been deleted.*

The ability to avoid conflicts depends on how sensitive the ‘define’-operations are on the order of the operations. We will have to establish a priority and/or hierarchy within the operations. 

- In the case of ‘Changing an asset name’ vs ‘Deleting an asset’, changing an asset name-operation has a lower priority since it becomes redundant after the asset has been deleted.

The more fault tolerant our operations are, the more flexible they are to be reordered once conflicts arise. Currently the document model tries to be very picky, and has low error tolerance. Yet we should optimise to be as flexible as possible to interpretate the intention of the user. If we get a flexible operations order/hierarchy in place we can have a ‘uni directional synchronisation’.

As a summary to avoid synchronisation problems we’ll: 

1. Send updates, early and often to avoid any type of “integration hell”. We’re dealing with a **real time** scenario where changes are immediately propagated to the server. 
2. We’ll allow a naive rebase, a pretty straight forward reshuffling of operations. 
3. We’ll make sure the operations are defined as flexible and as fault tolerant as possible.

All of the above should allow us to get away with a uni-directional synchronisation for now. 

## Synchronization Protocol Overview

Below is the high-level list of steps that form the synchronization protocol for **a single synchronization strand** or **all strands for a given** `listener_id`, with the outcome of each step briefly described.

1. **[Sender] SETUP**
    
    ⇒ Sender has the `(sync_id, sync_rev, listener_id, listener_rev)` tuples registered in the Listener State Cache, with an initial listener revision number, typically 0.
    
2. **[Receiver] REQUEST (only in case of a Pull Update)**
    
    ⇒ Receiver has posted a synchronization request for a given `listener_id` and, optionally, a list of `sync_id` values, or their identifying tuples `(drive_id, document_id, branch, scope)`. Optionally it can provide the latest `listener_rev` value for one or more strands as well. 
    
    ⇒ Ideally, more robust pull signals may ask the sender to identify *all synchronization units with updates since a given timestamp* and pull as many changes in one go as possible. Note that the Receiver will need to be authenticated if any information (`listener_rev`) is accepted from it.
    
3. **[Sender] TRIGGER/UPDATE/SELECT**
    
    ⇒ Sender was triggered via internal (push) or external (pull) signal, it updated the `(sync_id, sync_rev, listener_id, listener_rev)` tuple with the latest `sync_rev` number, and it verified that the trigger condition was satisfied (depending on the trigger, for example: `sync_rev > listener_rev AND block=true`, and `NOW > pending_timeout` (see next point)).
    
    ⇒ Sender has updated the selected strand with `listener_status = PENDING` and `pending_timeout = NOW + 5min`. This will prevent any other process from picking up this strand in the next 5 mins. If the Sender process crashes before it can update the `listener_status` again, or the Receiver fails to acknowledge the result, the timeout will expire and the next Sender process will pick up the task again.  
    
    ⇒ If the trigger was invoked through a pull signal, and the request included the `listener_rev` value(s), and the Receiver was correctly authenticated, then Sender should have updated `listener_rev` together with the `sync_rev` number.
    
4. **[Sender] PREDICT**
    
    ⇒ Sender has predicted the optimal list of updates that should be included for the selected sync unit(s) by comparing the `sync_rev` with the `listener_rev`, and potentially by taking other factors into consideration. These factors may include size and throughput constraints. For example, when synchronizing many strands or big attachments, updates may be sent with one or a few operations at a time to reduce the message size.
    
    ⇒ The update message includes (1) the synchronization unit identity (drive, document, branch, and scope), (2) the list with selected new operations and their revision numbers, and (3) the resulting state.
    
5. **[Sender] PRE-PROCESS (only in case of Process/Send)**
    
    ⇒ Depending on the specific Listener / Transmitter configuration, the list with updates is pre-processed by the Sender. For example, all information could be stripped except for the resulting state in case of a simple Webhook call. Certain parameters such as branch and scope may be moved to the message header instead of the body, etc. 
    
6. **[Sender] TRANSMIT**
    
    ⇒ The Sender invokes the Transmitter to send the (potentially pre-processed) list of the changes to the Receiver. This can take many forms: from a simple in-memory call to a Listener service/component, to a REST or GraphQL call, to the posting of a message on a centralized or decentralized message bus. 
    
7. **[Receiver] POST-PROCESS (only in case of Send/Process)**
    
    ⇒ The Receiver processes the list of changes (= “the updates list”) in the update loop. It has the document processor verify every operation and it appends any new operations to the operation history / histories as needed.
    
    ⇒ If the Receiver receives any duplicate operations, it should verify that they yield the same result that was already present by comparing the `state_hash` before moving on to the next operation. If the `state_hash` is not identical, the Receiver should stop the update loop for the given strand and report a `CONFLICT` status (see next step.)
    
    ⇒ In case the Receiver update loop encounters an operation update with a `skip` value, it should (re-)apply the operation if (1) the operation is new, OR (2) the operation exists but its `skip` value is lower than the newly received one. “Apply the operation” here means: 
    
    (1) add / update the operation with the received `skip` value to the history, 
    
    (2) turn any undone operations into `NOOP` operations, and 
    
    (3) then proceed normally with the rest of the updates loop.
    
8. **[Receiver] RETURN**
    
    ⇒ In case of **Process/Send**: the Receiver returns either `SUCCESS` or not. If the Receiver returns success, the Sender should assume that the `listener_rev` was successfully updated to the most recent revision index in the sent updates list. 
    
    ⇒ In case of **Send/Process**: the Receiver returns an array with status updates, one for each strand that was included in the updates list. A status update has the format `(drive_id, document_id, branch, scope, status, revision)`. 
    
    `revision` is the highest revision index that the update loop has successfully processed for that specific synchronization unit.
    
    `status` can be one of: 
    
    - `SUCCESS` in case all update operations were successfully appended or were already present and valid in the operation history. This implies that `revision` successfully arrived at the revision number of the most recent operation in the updates list.
    - `MISSING` in case the Receiver was missing one or more operations to complete the update loop.  `revision` indicates the revision index of the highest operation that was successfully applied.
    - `CONFLICT` in case the update list contained (an) operation(s) with a revision number that already existed, but did not yield the same result. `revision` indicates the revision index of the conflicting operation.
    - `ERROR` in case of any other errors. `revision` indicates the revision index of the highest operation that was successfully applied.
    
    ⇒ Note: in theory, the unidirectional synchronization protocol without branching and merging cannot resolve conflicts, it can only detect them. 
    
    For now, **the quickest way to deal with conflicts may be to do a local rebase on the Receiver side** instead of invoking the `CONFLICT` status: put the conflicting operations aside, replace with the Sender operations, and re-append afterwards with fresh revision index numbers.
    
    This will definitely lead to errors in some situations, but may work in the majority of the cases *if the operation reducers are fault-tolerant* (which should be a goal anyway.) In that sense, it’s an interesting exercise to see how flexible for reordering the operations can be made.
    
9. **[Sender] ADJUST** 
    
    ⇒ The Sender updates the `listener_rev` and `listener_status` in the listener cache based on the return value from the Receiver. `pending_timeout` is set to NULL.
    

# Transmitter Architectures

*(work in progress)*

The available transmitter components will probably evolve into a configurable set that supports multiple configurations with wrappers / middleware / decorators. 

For now, the `SwitchboardPush`, `PullResponder` and `Internal` transmitters should be prioritized. Some other candidates are already mentioned to cover the a broader range of use cases. 

## Common GraphQL Types

These types are referenced in both the `SwitchboardPush` and `PullResponder` transmitters.

```graphql
type ListenerRevision {
	driveId: String!	
	documentId: String!
	scope: String!
	branch: String!
	status: UpdateStatus!
	revision: Int!
}

enum UpdateStatus {
	SUCCESS
	MISSING	
	CONFLICT
	ERROR
}

type StrandUpdate {
	driveId: String!	
	documentId: String!
	scope: String!
	branch: String!
	operations: [OperationUpdate!]!
}

type OperationUpdate {
	revision: Int!
	skip: Int!
	name: String!
	inputJson: String!
	stateHash: String!
}
```

## The SwitchboardPush Transmitter

Mutation used for a **Sender pushing unprocessed updates** to the **Switchboard Receiver** (`R ⇤ Š`):

```graphql
mutation {
	pushUpdates(strands: [StrandUpdate]): [ListenerRevision!]!
}
```

## The PullResponder Transmitter

Endpoints used by a **Reader pulling unprocessed updates** from the **Switchboard Sender** (`S ⇥ Ř`):

```graphql
type PullUpdates {
	strands(listenerId:ID, revisions:[ListenerRevision]): [StrandUpdate!]!
	strandsSince(listenerId:ID, since:DateTime): [StrandUpdate!]!
	acknowledge(listenerId:ID, revisions:[ListenerRevision!]!): Boolean
}
```

- Sender is triggered externally by an incoming pull update call `strands(..)` from the Receiver (which optionally includes the latest `listener_rev` numbers).
- Sender “transmits to” the Receiver by writing the selected operation updates to the response object. Resulting in the `[StrandUpdate!]!` response.
- Receiver “returns the transmission result” by making a second call to the Sender (`acknowledge(..)` call, before `pending_timeout` if everything goes well) with the sync units’ status + revision number updates.
- Optimization is to not wait for the acknowledgement call if 0 updates were transmitted. So the second call will be avoided most of the time.

## The Internal Transmitter

Transmitter for read model updates that are updated by an internal listener service (`Š ⇥ R`). This can be used within Switchboard to update **operational data** sets and **analytics data** sets based on the changes that are happening to the primary source documents.

```jsx
context.listeners[name].processUpdate(
	driveId,	
	documentId, 
	scope,
	branch, 
	revisionIndex,
	operationData,
	resultingState 
) => ... (update analytics data) 
```

## The RestWebhook Transmitter

Transmitter for pushing changes to an external REST web service (`Š ↦ R`). 

- Changes are pushed **one strand at a time**.
- The receiver’s return value is a **single [HTTP status code](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)** and indicates the new status of the strand. Translation could look something like the following:
    - Status `200 OK` or any other `2xx` range code ⇒ `SUCCESS`. Implied new `listener_revision` is the latest revision sent.
    - Status `409 Conflict` ⇒ `CONFLICT`. `listener_revision` should be reported in the header or body of the response. In this case the receiver is presumably already customized to return the `409` code, so adding the revision number should be possible too.
    - Other status codes `4xx Client Error` and `5xx Server Error` ⇒ `ERROR`. Some errors may lead to retries later while others may lead the update to be dropped. TBD.
- The transmitter should be configurable to some extent to shape the HTTP request. For example, some services may just want a ping with the document id and new revision number. Others may want to receive the new operations. Others may just want to receive the resulting new document state.
- …

## The SecureConnect Transmitter

Transmitter for establishing secure connections with a Secure Cloud Drive.

## The MatrixConnect Transmitter

Transmitter for establishing secure connections when setting up synchronization channels with individuals.

# Bidirectional Synchronization Protocol

TODO