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

/**
 * Utility function that downloads an attachment.
 * 
 * @param ref - The attachment reference.
 * @param progressHandler - A function that is called with the progress of the download.
 * @returns The attachment response.
 */
function downloadAttachment(
  ref: AttachmentRef,
  progressHandler?: (t: number) => void,
): Promise<AttachmentResponse>;

```