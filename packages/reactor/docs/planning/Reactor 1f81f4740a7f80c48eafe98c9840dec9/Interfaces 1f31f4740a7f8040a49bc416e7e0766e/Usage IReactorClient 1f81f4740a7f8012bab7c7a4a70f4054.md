# Usage: IReactorClient

### Creation

```tsx
const subscriptions: ISubscriptionManager = new SubscriptionManager();
const reactor: IReactor = getReactor(subscriptions);

// wraps a reactor and subscriptions
const client: IReactorClient = new ReactorClient(reactor, subscriptions);

// document models
const { results } = await client.getDocumentModels();

const model = results.find(m => m.name === "task-list");
if (!model) {
  console.log(`Model ${modelName} is not supported`);
  exit(1);
}

// document creation
let workList = await client.create<TaskListDocument>(
  createDocument({ slug: "work" }),
);

console.log(`Created document ${workList.name} with ID ${workList.id}`);

// document updates
workList = await client.mutate(
  workList.id,
  [addTodo({ name: "Call Stephen" })],
);

// document retrieval
const { document: homeList } = await client.get<TaskListDocument>("home");

console.log(`Document ${homeList.name} has ${homeList.state.global.todos.length} todos`);

// document relationships
const drive = await client.create<DriveDocument>(
  createDocument({ slug: "mine" }),
);

await client.addChildren(
  drive.id,
  [workList.id, homeList.id],
);

// document searching
let all = [];
let next = () => client.find(
  { type: "task-list" },
  //  (header only, since we don't need all the data)
  { headerOnly: true },
  { limit: 100 });

// paginate with raw API (maybe we want to persist the cursor)
while (next) {
  const { results, next: nextPage } = await next();
  all.push(...results.map(r => r.id));

  next = nextPage;
}

// paginate with the async iterator instead
all = [];
for await (const page of paginate(
  () => client.find(
    { type: "task-list" },
    { headerOnly: true },
    { limit: 100 }),
)) {
  for (const document of page.results) {
    all.push(document.id);
  }
}

// add to my drive
await client.addChildren(
  drive.id,
  all,
);

// document branching
const document = await client.branch(workList.id, "sprint/01");

// perform operation
document = await client.mutate(
  document.id,
  [addTodo({ name: "Write Spec" })],
);

// merge (throws on unrecoverable errors, not conflicts)
const result = await client.merge(
  document.id,
  "sprint/01",
  "main",
);

if (result.conflicts) {
  // todo
} else {
  // merge complete
  console.log(`Merge complete, resulting document: ${result.document}`);
}
```

### Subscriptions

```tsx
// Subscribe with a ViewFilter, which will populate events for you.
const unsubscribe = client.subscribe(
  { type: 'Task' },
  (event) => {
    switch (event.type) {
      case DocumentChangeType.Created:
        console.log('Documents created:', event.documents);
        break;
      case DocumentChangeType.Updated:
        console.log('Documents updated:', event.documents);
        break;
      case DocumentChangeType.Deleted:
        console.log('Documents deleted, IDs:', event.context?.documentIds);
        break;
      case DocumentChangeType.ParentAdded:
      case DocumentChangeType.ParentRemoved:
        console.log('Relationship changed:', {
          parentId: event.context?.parentId,
          childId: event.context?.childId,
          added: event.type === DocumentChangeType.ParentAdded
        });
        break;
    }
  },
  { scopes: ['global'], branch: 'feature/test-feat' },
);

// Later, unsubscribe from all events
unsubscribe();
```