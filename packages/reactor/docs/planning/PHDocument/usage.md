# Usage


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