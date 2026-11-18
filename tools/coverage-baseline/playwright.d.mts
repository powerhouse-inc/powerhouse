import type { Browser, BrowserContext, Page } from "@playwright/test";
export * from "@playwright/test";
export function closePage(page: Page): Promise<void>;
export function closeContext(context: BrowserContext): Promise<void>;
export function collectBrowser(
  browser: Browser,
  port: number,
  output: string,
  options?: {
    root?: string;
    sources?: string[];
    testIds?: Set<string>;
    onTargetReady?: (target: { type: string }) => void;
  },
): Promise<() => Promise<void>>;
