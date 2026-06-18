import { getStorageNamespace } from "@powerhousedao/shared/connect";
import { hashNamespace } from "@powerhousedao/shared/processors";

export type ReactorNamespaceInput = {
  basePath: string;
  explicit?: string;
  endpoint?: string;
};

export function resolveReactorNamespace(input: ReactorNamespaceInput): string {
  const explicit = input.explicit?.trim();
  if (explicit) {
    return explicit;
  }
  const base = getStorageNamespace(input.basePath);
  const endpoint = input.endpoint?.trim();
  if (endpoint) {
    return `${base}--${hashNamespace(endpoint, 8)}`;
  }
  return base;
}
