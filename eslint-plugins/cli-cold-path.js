// Standalone ESLint v9-compatible plugin: allowlist-only static imports
// for CLI cold paths. Extracted from eslint.config.js so both ESLint and
// oxlint (jsPlugins) can consume the same source of truth.

import { builtinModules } from "node:module";

const builtinSet = new Set(builtinModules);

const allowedStaticImports = {
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
  create(context) {
    const opts = context.options[0] ?? {};
    const allow = opts.allow ?? [];
    const message = opts.message ?? "Static import not allowed here.";
    const isAllowedSource = (src) => {
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
        const src = String(node.source.value);
        if (isAllowedSource(src)) return;
        context.report({
          node: node.source,
          messageId: "notAllowed",
          data: { source: src, message },
        });
      },
    };
  },
};

export default {
  meta: { name: "cli-cold-path" },
  rules: {
    "allowed-static-imports": allowedStaticImports,
  },
};
