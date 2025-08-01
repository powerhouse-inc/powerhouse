# PHDocument

### Summary

`PHDocument` is the core object that represents a document's data in the Reactor system.

We break PHDocument into two objects:

```tsx
class PHDocument {
  header: PHDocumentHeader;
  state: PHDocumentState;

  constructor(header: PHDocumentHeader, state: PHDocumentState) {
    this.header = header;
    this.state = state;
  }
}
```

We also define a `PHDocumentController` object that is used to wrap and interact with the document.

```tsx
class PHDocumentController {
  document: PHDocument;

  mutations: PHDocumentMutations;
  history: PHDocumentHistory;

  constructor(document: PHDocument) {
    this.document = document;

    ...
  }

  get header(): PHDocumentHeader {
    return this.document.header;
  }

  // elided
}
```

### Header

The `header` object contains a number of key elements:

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

#### Id

The `id` is a unique, Ed25519 signature on the header object. It is used to verify the creator of a document to a document id. The payload will be formed deterministically from document header data (like `createdAtUtcMs`, `documentType`), plus a `nonce` present in the signature information.

Cryptographic signatures are generated and verified using the Web Crypto API. See the [signing](./signing.md) document for more information.

This has effects on storage mechanisms, as currently the document id is used as a primary key. Because these signatures have a uniform distribution, they make poor lookups for typical btree indexes. A hash index may be used instead, but hash indexes cannot serve as primary keys. Likely, the storage layer will need to either use a secondary index or eat the cost of poor indexing for document ids.

See the header section below for more information.

### State

The state object is a plain, serializable object that has keys for each populated scope. The scopes will generally be filled in according to the `ViewFilter` that is passed into the reactor client or storage layers. For example, when scopes on the `ViewFilter` are set to `["global", "public"]`, then the state state object will have `global` and `public` keys.

The `auth` scope is always present, but populated only with state that is available to that user. The `document` scope is a "special case" scope that is always present and is a default scope used for upgrades and initial scope, but is not necessarily populated.

```tsx
type PHDocumentState = {
  auth: AuthScopeState;
  document: DocumentScopeState;
}

//

const state = { ...prevState, myScope: { ...prevState.myScope, foo: 4 } };
```

Custom document types extend the `PHDocument` class:

```tsx
// simple type intersection for state
type MyDocModelState = PHDocumentState & {
  myScope: MyScopeState;
}

// subclass of PHDocument, overriding the state
class MyDocument extends PHDocument {
  state: MyDocModelState;

  constructor(header: PHDocumentHeader, state: MyDocModelState) {
    super(header, state);
  }

  // elided
}
```

This means that references to `state` are dependent on the reference to the `PHDocument` type.

```tsx
const myDocument: MyDocument = getDocument();

// this is safe because `state` is typed to `MyDocModelState`
const myCustomScopeField = myDocument.state.myScope.foo;

const superClass: PHDocument = myDocument;

// this is a compile error, since we hold a reference to the PHDocument typse
const superClassField = superClass.state.myScope.foo;
```

We can provide factory methods to correctly create the derived documents with specific mutations:

```tsx
class MyDocument extends PHDocument {
  constructor(header: PHDocumentHeader, state: MyDocModelState) {
    super(header, state);
  }

  ...

  static fromRevisions(document: PHDocument, scope: string, revision: number): MyDocument {
    return new MyDocument({
      ...document.header,
      revision: {
        ...document.header.revision,
        [scope]: revision,
      },
    }, state);
  }
}
```

### Mutations

The mutations object is a typed API for creating and/or executing operations. It has operation-specific methods that pertain to the specific scope.

```tsx

// base class
class PHDocumentMutations {
  auth: AuthMutations;
  document: DocumentMutations;
}

// derived class
class DriveGlobalMutations extends PHDocumentMutations {
  setDriveIcon(icon: string): ActionExecutor {
    // elided
  }

  setDriveName(name: string): ActionExecutor {
    // elided
  }
}
```

The `ActionExecutor` is a wrapper around an `Action` that provides a way to execute the action or pass it into the Reactor API.

```tsx

interface IExecutionDelegate {
  /**
   * Executes the action.
   */
  execute(action: Action): Promise<void>;
}

class ActionExecutor {
  constructor(
    private readonly executionDelegate: IExecutionDelegate,
    private readonly action: Action,
  ) {
    this.action = action;
  }

  /**
   * Retrieves the underlying action that will be executed.
   */
  get action(): Action {
    return this.action;
  }

  /**
   * Executes the underlying action.
   */
  execute(): Promise<void> {
    return this.executionDelegate.execute(this.action);
  }
}
```

This allows us to execute actions in a more functional way:

```tsx
// change the drive icon
await drive.mutations.global.setDriveIcon({
  icon: "🚀",
}).execute();

// add a new folder
await drive.mutations.global.setDriveName({
  name: "My Drive",
}).execute();
```

But we are still free to batch operations together via the client API:

```tsx
await client.mutate(
  drive.id,
  [
    drive.mutations.global.setDriveName({ name: "My Drive" }).action,
    drive.mutations.global.setDriveIcon({ icon: "🚀" }).action,
  ],
);
```

#### History

The history object is an API for fetching document history, per scope.

```tsx
const operations = await drive.history.fetchOperations("myScope");

console.log(`Drive history: ${operations.length} operations`);

// this is paged:
for await (const page of paginate(() => drive.history.fetchOperations("myScope", { limit: 1000 }))) {
  for (const operation of page.results) {
    console.log(operation.id);
  }
}

// or, we can fetch a specific revision of the document
const document = await drive.history.fetch({
  revision: 10,
});
```
