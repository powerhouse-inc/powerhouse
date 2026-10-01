/** Spaces calls to at most `perSecond`, in the order they ask. */
export function pacer(perSecond: number): () => Promise<void> {
  const gap = 1000 / perSecond;
  let next = 0;
  return () => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + gap;
    return at > now
      ? new Promise((resolve) => setTimeout(resolve, at - now))
      : Promise.resolve();
  };
}
