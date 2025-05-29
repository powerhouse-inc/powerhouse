# Usage

### paginate()

Creates an asynchronous iterator for any function that returns paginated results.

```tsx
for await (const page of paginate(() => client.find(
    { type: "task-list" },
    { headerOnly: true },
    { limit: 100 }),
)) {
  for (const result of page.results) {
		console.log(result.id);
  }
}
```

### retry()

Retries an async function multiple times, with backoff and jitter options.

```tsx
const doc = await retry(
  () => client.create("my-doc"),
  3,
  ExponentialBackoffAndJitter,
);
```