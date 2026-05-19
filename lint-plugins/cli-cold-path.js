// Oxlint JS plugin: allowlist-only static imports for CLI cold paths.
// Uses `@oxlint/plugins` for type-checked definePlugin / defineRule helpers
// and the `createOnce` API so the rule is initialized once per process
// instead of per file.
//
// Docs: https://oxc.rs/docs/guide/usage/linter/js-plugins

import { builtinModules } from "node:module";
import { defineRule, definePlugin } from "@oxlint/plugins";

const builtinSet = new Set(builtinModules);

const allowedStaticImports = defineRule({
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: {
          allow: { type: "array", items: { type: "string" } },
          message: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      notAllowed:
        "{{message}} (`{{source}}` is not in the allow list; use `await import(...)` inside the command handler method)",
    },
  },
  createOnce(context) {
    // Options aren't available at createOnce top-level — they're per-file.
    // Read them lazily inside the visitor.
    const isAllowedSource = (src, allow) => {
      if (src.startsWith("node:")) return true;
      if (builtinSet.has(src)) return true;
      if (
        src === "." ||
        src === ".." ||
        src.startsWith("./") ||
        src.startsWith("../")
      ) {
        return true;
      }
      return allow.some((name) => src === name || src.startsWith(name + "/"));
    };
    return {
      ImportDeclaration(node) {
        if (node.importKind === "type") return;
        const hasValueSpecifier =
          node.specifiers.length === 0 ||
          node.specifiers.some((s) => s.importKind !== "type");
        if (!hasValueSpecifier) return;
        const opts = context.options?.[0] ?? {};
        const allow = opts.allow ?? [];
        const message = opts.message ?? "Static import not allowed here.";
        const src = String(node.source.value);
        if (isAllowedSource(src, allow)) return;
        context.report({
          node: node.source,
          messageId: "notAllowed",
          data: { source: src, message },
        });
      },
    };
  },
});

export default definePlugin({
  meta: { name: "cli-cold-path" },
  rules: {
    "allowed-static-imports": allowedStaticImports,
  },
});
