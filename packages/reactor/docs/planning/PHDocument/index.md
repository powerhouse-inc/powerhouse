# PHDocument

### Summary

`PHDocument` is the core object that represents a document in the Reactor system. It is a typed API for interacting with a document.

We break PHDocument into four objects:

```tsx
{
  header,    // header information

	state,     // plain, serializable object
	
	mutations, // typed API for creting and/or executing operations
	
	history,   // typed API for fetching document history
}
```

#### Header

The special case `header` scope contains a number of key elements:

```tsx
export type PHDocumentSignatureInfo = {
  /**
   * The public key of the document creator.
   *
   * This is generally a JsonWebKey, but there is no shared type for this
   * between node and the browser.
   **/
  publicKey: any;

  /** The nonce that was appended to the message to create the signature. */
  nonce: string;
};

export type PHDocumentHeader = {
  /**
   * The id of the document.
   *
   * This is a Ed25519 signature and is immutable.
   **/
  id: string;

  /**
   * Information to verify the document creator.
   *
   * This is immutable.
   **/
  sig: PHDocumentSignatureInfo;

  /**
   * The type of the document.
   *
   * This is used as part of the signature payload and thus, cannot be changed
   * after the document header has been created.
   **/
  documentType: string;

  /**
   * The timestamp of the creation date of the document, in UTC ISO format.
   *
   * This is used as part of the signature payload and thus, cannot be changed
   * after the document header has been created.
   **/
  createdAtUtcIso: string;

  /** The slug of the document. */
  slug: string;

  /** The name of the document. */
  name: string;

  /** The branch of this document. */
  branch: string;

  /**
   * The revision of each scope of the document. This object is updated every
   * time any _other_ scope is updated.
   */
  revision: {
    [scope: string]: number;
  };

  /**
   * The timestamp of the last change in the document, in UTC ISO format.
   **/
  lastModifiedAtUtcIso: string;

  /** Meta information about the document. */
  meta?: {
    /** The preferred editor for the document. */
    preferredEditor?: string;
  };
};
```

##### Id

The `id` is a unique, Ed25519 signature on the header object. It is used to verify the creator of a document to a document id. The payload will be formed deterministically from document header data (like `createdAtUtcMs`, `documentType`), plus a `nonce` present in the signature information.

Cryptographic signatures are generated and verified using the Web Crypto API. See the [signing](./signing.md) document for more information.

This has effects on storage mechanisms, as currently the document id is used as a primary key. Because these signatures have a uniform distribution, they make poor lookups for typical btree indexes. A hash index may be used instead, but hash indexes cannot serve as primary keys. Likely, the storage layer will need to either use a secondary index or eat the cost of poor indexing for document ids.

See the header section below for more information.

#### State

The state object is a plain, serializable object that has keys for each populated scope. The scopes will generally be filled in according to the `ViewFilter` that is passed into the reactor client or storage layers. For example, when scopes on the `ViewFilter` are set to `["global", "public"]`, then the state state object will have `global` and `public` keys.

The `header` scope is a "special case" scope that is always populated, and the `document` scope is a default scope used for upgrades and initial scope, but is not necessarily populated.

```tsx
type BaseDocumentState = {
  auth: AuthScopeState;
}

export type PHDocument<TState extends BaseDocumentState> = {
  header: PHDocumentHeader;
  state: TState;
  mutations: PHDocumentMutations<TState>;
  history: PHDocumentHistory<TState>;
}
```

Querying looks like:

```tsx
let drive = await client.get<DocumentDriveDocument>("mine");

console.log(`Drive icon: ${drive.state.document.icon}`);
```

Custom document types extend this:

```tsx
type MyDocumentDocumentState = {
  title: string;
}

type MyOtherScopeState = {
  foo: number;
}

type MyDocument = PHDocument<MyDocumentDocumentState> & {
  myOtherScope: MyOtherScopeState;
};
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
