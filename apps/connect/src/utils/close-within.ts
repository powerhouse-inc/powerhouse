/** A store whose session died never finishes closing; clearing storage must not wait on it forever. */
export async function closeWithin(
  store: { close: () => Promise<void> } | undefined,
  timeoutMs = 5_000,
): Promise<void> {
  if (!store) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.error(
        `[connect] store close did not finish within ${timeoutMs}ms`,
      );
      resolve();
    }, timeoutMs);
  });
  try {
    await Promise.race([store.close(), expired]);
  } catch (error) {
    console.error("[connect] store close failed:", error);
  } finally {
    clearTimeout(timer);
  }
}
