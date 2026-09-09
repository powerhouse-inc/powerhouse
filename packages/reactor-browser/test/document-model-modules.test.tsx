import { renderHook } from "vitest-browser-react";
import { describe, expect, it } from "vitest";
import { useDocumentModelModuleById } from "../src/hooks/document-model-modules.js";

/**
 * `useGetSwitchboardLink` resolves the document model through this hook in
 * contexts with AND without a vetra package manager registered (Connect vs.
 * storybook). It must return `undefined` rather than throw in the latter.
 */
describe("useDocumentModelModuleById without a provider", () => {
  it("returns undefined when no vetra package manager is registered", () => {
    const { result } = renderHook(() =>
      useDocumentModelModuleById("powerhouse/invoice"),
    );
    expect(result.current).toBeUndefined();
  });

  it("returns undefined for a missing id", () => {
    const { result } = renderHook(() => useDocumentModelModuleById(undefined));
    expect(result.current).toBeUndefined();
  });
});
