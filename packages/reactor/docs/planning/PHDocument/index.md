# PHDocument

### Summary

We break PHDocument into four objects:

```tsx
{
	state,     // plain, serializable object
	
	mutations, // typed API for creting and/or executing operations
	
	history,   // typed API for fetching document history
}
```

#### State

The state object is a plain, serializable object that has keys for each populated scope. The scopes will generally be filled in according to the `ViewFilter` that is passed into the reactor client or storage layers.

For example, when scopes on the `ViewFilter` are set to `["global", "public"]`, then the state state object will have `global` and `public` keys.

The `header` scope is a "special case" scope that is always populated.

```tsx
let drive = await client.get<DocumentDriveDocument>("mine");

console.log(`Drive icon: ${drive.state.global.icon}`);
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
