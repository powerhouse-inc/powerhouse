# Interface

```tsx
/**
 * Utility function that creates an async iterable for paginated results, handling network requests lazily
 * 
 * @param fn - A function that returns a Promise<PagedResults<T>> for any page
 * @returns AsyncIterable that yields pages of results as they're fetched
 */
function paginate<T>(
  fn: () => Promise<PagedResults<T>>,
): AsyncIterable<PagedResults<T>>;

enum RetryBehavior {
  ExponentialBackoffAndJitter,
  LinearSleep,
  Synchronous,
}

/**
 * Utility function that retries an asynchronous action.
 */
function retry<T>(
	fn: () => Promise<T>,
	times: number,
  behavior: RetryBehavior,
): Promise<T>;
```