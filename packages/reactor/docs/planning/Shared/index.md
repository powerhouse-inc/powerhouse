# Shared

## Summary

Various types and strategies used throughout.

## Network Retries

Retry logic over a network should generally be implemented with both exponential backoff and jitter.

See the [AWS Study](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) for more details.

## AbortController & AbortSignal

Throughout the Reactor package, we use the `AbortSignal` interface to allow for graceful cancellation of requests. This cancels asynchronous operations, like network requests, or long-running operations. While the standard approach is to use `AbortController` and `AbortSignal`, unfortunately a `DOMException` is thrown in browsers, which is not supported in `node`. Instead, `node` throws an `AbortError`.

This is why we provide a helper function that should be used to test:

```tsx
const controller = new AbortController();

// elided ...

try {
  await reactor.get(docId, {}, controller.signal);
} catch (error) {
  if (isAbortError(error)) {
    // elided ...
  }
}

// somewhere else ...

controller.abort();
```

## Links

- [Interface](interface.md)
