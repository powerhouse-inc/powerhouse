# PHDocument

**Summary:**

We break PHDocument into four objects:

```tsx
{
	header,    // meta
	
	state,     // plain, serializable object
	
	mutations, // typed API for creting and/or executing operations
	
	history,   // typed API for fetching document history
}
```

The state will generally be filled in according to the `ViewFilter` that is passed into the reactor client. For instance, when scopes are set to `["global"]`, then only the global state is returned on the state object. When `headerOnly` is set to true, the `state` object will not be populated at all.

### Usage

```tsx
let drive = await client.get<DocumentDriveDocument>("mine");

// the `state` property is a plain, serializable object
console.log(`Drive icon: ${drive.state.global.icon}`);

// the `mutations` property is a typed API for creating operations

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

// the `history` object is a typed API for fetching the history of a document

await drive.history.global.fetch();

console.log(`Drive history: ${drive.history.global.operations.length} operations`);

// we can also fetch history for a specific revision
const history = await drive.history.global.fetch(10);

console.log(`History for revision 10: ${history.length} operations`);
```