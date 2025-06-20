# PHDocument

### Summary

`PHDocument` is the core object that represents a document in the Reactor system. It is a typed API for interacting with a document.

We break PHDocument into four objects:

```tsx
{
  id,        // the document ID

	state,     // plain, serializable object
	
	mutations, // typed API for creting and/or executing operations
	
	history,   // typed API for fetching document history
}
```

#### Id

The `id` is a unique, Ed25519 signature of the document header data. It is used to verify the creator of a document to a document id.

This has effects on storage mechanisms, as currently the document id is used as a primary key. Because these signatures have a uniform distribution, they make poor lookups for typical btree indexes. A hash index may be used instead, but hash indexes cannot serve as primary keys. Likely, the storage layer will need to either use a secondary index or eat the cost of poor indexing for document ids.

See the header section below for more information.

#### State

The state object is a plain, serializable object that has keys for each populated scope. The scopes will generally be filled in according to the `ViewFilter` that is passed into the reactor client or storage layers.

For example, when scopes on the `ViewFilter` are set to `["global", "public"]`, then the state state object will have `global` and `public` keys.

The `header` scope is a "special case" scope that is always populated.

```tsx
let drive = await client.get<DocumentDriveDocument>("mine");

console.log(`Drive icon: ${drive.state.global.icon}`);
```

##### Header

The special case `header` scope contains a number of key elements:

```tsx
type SignatureInfo = {
  /** The public key of the document creator. */
  publicKey: string;

  /** The message that was signed. */
  message: string;

  /** The nonce that was appended to the message to create the signature. */
  nonce: string;
}

type DocumentHeader = {
  /** Information to verify the document creator. */
  sig: SignatureInfo;

  /** The slug of the document. */
  slug: string;

  /** The name of the document. */
  name: string;

  /** The branch of this document. */
  branch: string;

  /** The type of the document. */
  documentType: string;

  /** The number of operations applied to the document, per scope. */
  revisions: {
    [scope: string]: number;
  };
  
  /** The timestamp of the creation date of the document. */
  createdAtUtcMs: number;
  
  /** The timestamp of the last change in the document. */
  lastModifiedAtUtcMs: number;

  /** Meta information about the document. */
  meta?: {
    /** The preferred editor for the document. */
    preferredEditor?: string;
  };
}
```

#### Mutations

The mutations object is a typed API for creating and/or executing operations. It has operation-specific methods that pertain to the specific scope.

```tsx
// change the drive icon
await drive.mutations.global.setDriveIcon({
  icon: "🚀",
}).execute();

// add a new folder
await drive.mutations.global.setDriveName({
  name: "My Drive",
}).execute();

// we are still free to batch operations together via the client API
await client.mutate(
  drive.id,
  [
    drive.mutations.global.setDriveName({ name: "My Drive" }),
    drive.mutations.global.setDriveIcon({ icon: "🚀" }),
  ],
);
```

#### History

The history object is a typed API for fetching document history.

```tsx
await drive.history.global.fetch();

console.log(`Drive history: ${drive.history.global.operations.length} operations`);

const history = await drive.history.global.fetch(10);

console.log(`History for revision 10: ${history.length} operations`);
```
