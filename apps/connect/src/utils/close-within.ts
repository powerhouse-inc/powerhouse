/**
 * A store whose session died never finishes closing; clearing storage must not
 * wait on it forever. True only when the store is known closed.
 */
export async function closeWithin(
  store: { close: () => Promise<void> } | undefined,
  timeoutMs = 5_000,
): Promise<boolean> {
  if (!store) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      console.error(
        `[connect] store close did not finish within ${timeoutMs}ms`,
      );
      resolve(false);
    }, timeoutMs);
  });
  try {
    return await Promise.race([store.close().then(() => true), expired]);
  } catch (error) {
    console.error("[connect] store close failed:", error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
