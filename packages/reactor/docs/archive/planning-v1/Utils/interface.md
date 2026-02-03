# Interface

```tsx
/**
 * Utility function that creates an async iterable for paginated results, handling network requests lazily
 *
 * @param fn - A function that returns a Promise<PagedResults<T>> for any page
 * @param signal - Optional abort signal to cancel pagination
 *
 * @returns AsyncIterable that yields pages of results as they're fetched
 */
function paginate<T>(
  fn: () => Promise<PagedResults<T>>,
  signal?: AbortSignal,
): AsyncIterable<PagedResults<T>>;

enum RetryBehavior {
  ExponentialBackoffAndJitter,
  LinearSleep,
  Synchronous,
}

/**
 * Utility function that retries an asynchronous action.
 *
 * @param fn - A function that returns a Promise<T>
 * @param times - The number of times to retry the function
 * @param behavior - The behavior of the retry
 * @param signal - Optional abort signal to cancel retries
 *
 * @returns The result of the function
 */
function retry<T>(
  fn: () => Promise<T>,
  times: number,
  behavior: RetryBehavior,
  signal?: AbortSignal,
): Promise<T>;

/**
 * Utility function that downloads an attachment.
 *
 * @param ref - The attachment reference.
 * @param progressHandler - A function that is called with the progress of the download.
 * @param signal - Optional abort signal to cancel the download
 *
 * @returns The attachment response.
 */
function downloadAttachment(
  ref: AttachmentRef,
  progressHandler?: (t: number) => void,
  signal?: AbortSignal,
): Promise<AttachmentResponse>;
```
