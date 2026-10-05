// @ts-check

// Allow-list for static value imports in eagerly loaded CLI files. Node
// built-ins, relative paths and type-only imports always pass.
import { definePlugin, defineRule } from "@oxlint/plugins";
import { builtinModules } from "node:module";

const builtinSet = new Set(builtinModules);

const isAllowedSource = (
  /** @type {string} */ src,
  /** @type {string[]} */ allow,
) => {
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
    return {
      ImportDeclaration(node) {
        if (node.importKind === "type") return;
        const hasValueSpecifier =
          node.specifiers.length === 0 ||
          node.specifiers.some(
            (s) => /** @type {any} */ (s).importKind !== "type",
          );
        if (!hasValueSpecifier) return;
        // Options are per file, so read them in the visitor.
        const opts = /** @type {any} */ (context.options[0]) ?? {};
        const allow = /** @type {string[]} */ (opts.allow ?? []);
        const message = opts.message ?? "Static import not allowed here.";
        const src = String(node.source.value);
        if (isAllowedSource(src, allow)) return;
        context.report({
          node: node.source,
          messageId: "notAllowed",
          data: { source: src, message: String(message) },
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
