// Shim for @/lib/dom-utils (only what the vendored builder calls).
export function isElementInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth
  );
}

export function waitForElementToBeInDom(
  selector: string,
): Promise<Element | null> {
  return Promise.resolve(document.querySelector(selector));
}

export function isMac(): boolean {
  return /Mac/.test(globalThis.navigator.platform);
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
