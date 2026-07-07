export type PageableResult = Record<string, unknown> & {
  next: () => Promise<unknown>;
};

export type TokenizedPage = Record<string, unknown> & { nextToken: string };

export function isPageableResult(value: unknown): value is PageableResult {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { next?: unknown }).next === "function"
  );
}

export function hasNextToken(value: unknown): value is TokenizedPage {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { nextToken?: unknown }).nextToken === "string"
  );
}

export function dehydratePage(
  value: unknown,
  registerCursor: (next: () => Promise<unknown>) => string,
): unknown {
  if (!isPageableResult(value)) {
    return value;
  }
  const { next, ...rest } = value;
  return { ...rest, nextToken: registerCursor(next) };
}

export function rehydratePage(
  value: unknown,
  fetchPage: (token: string) => Promise<unknown>,
): unknown {
  if (!hasNextToken(value)) {
    return value;
  }
  const { nextToken, ...rest } = value;
  return { ...rest, next: () => fetchPage(nextToken) };
}
