# Usage

```tsx
const reactor: IReactor = getReactor();
const client: IReactorClient = new ReactorClient(reactor);

const { results } = await client.getDocumentModels();

console.log(`Found ${results.length} document models`);

const model = results.find((m) => m.name === "task-list");

if (!model) {
  console.log(`Model ${modelName} is not supported`);
  exit(1);
}

let workList = await client.create<TaskListDocument>(
  createDocument({ slug: "work" }),
);

console.log(`Created document ${workList.name} with ID ${workList.id}`);

// change the document
workList = await client.mutate(workList.id, [
  addTodo({ name: "Call Stephen" }),
]);

const { document: homeList } = await client.get<TaskListDocument>("home");

console.log(
  `Document ${homeList.name} has ${homeList.state.global.todos.length} todos`,
);

// put everything in a drive
const drive = await client.create<DriveDocument>(
  createDocument({ slug: "mine" }),
);

await client.addChildren(drive.id, [workList.id, homeList.id]);

// get all my other todos (header only, since we don't need all the data)
let all = [];
let next = () =>
  client.find({ type: "task-list" }, { headerOnly: true }, { limit: 100 });

while (next) {
  const { results, next: nextPage } = await next();
  all.push(...results.map((r) => r.id));

  next = nextPage;
}

// Using the new generator-based pagination API (much simpler!)
all = [];

// This handles the pagination automatically
for await (const page of paginate(() =>
  client.find({ type: "task-list" }, { headerOnly: true }, { limit: 100 }),
)) {
  for (const document of page.results) {
    all.push(document.id);
  }
}

// add to my drive
await client.addChildren(drive.id, all);

// branch a document
const document = await client.branch(workList.id, "sprint/01");

// perform operation
document = await client.mutate(document.id, [addTodo({ name: "Write Spec" })]);

// merge (throws on unrecoverable errors, not conflicts)
const result = await client.merge(document.id, "sprint/01", "main");

if (result.conflicts) {
  // todo
} else {
  // merge complete
  console.log(`Merge complete, resulting document: ${result.document}`);
}
```
