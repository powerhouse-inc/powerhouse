// Oxlint JS plugin: logger call-shape rules.
// Uses `@oxlint/plugins` for type-checked definePlugin / defineRule helpers
// and the `createOnce` API so the rule is initialized once per process
// instead of per file.
//
// Docs: https://oxc.rs/docs/guide/usage/linter/js-plugins
//
// The ConsoleLogger in `document-model` substitutes `@token` placeholders
// in the message string with positional args (one per unique token, in
// first-appearance order). Extra args past the unique-token count are
// appended; missing args render as `"null"`.

import { defineRule, definePlugin } from "@oxlint/plugins";

const LOGGER_METHODS = new Set(["verbose", "debug", "info", "warn", "error"]);

const isLoggerCallee = (callee) => {
  if (!callee || callee.type !== "MemberExpression" || callee.computed)
    return false;
  if (callee.property.type !== "Identifier") return false;
  if (!LOGGER_METHODS.has(callee.property.name)) return false;
  const obj = callee.object;
  if (obj.type === "Identifier") {
    return obj.name.toLowerCase().endsWith("logger");
  }
  if (obj.type === "MemberExpression" && !obj.computed) {
    if (obj.property.type === "Identifier") {
      return obj.property.name.toLowerCase().endsWith("logger");
    }
  }
  return false;
};

const staticMessage = (node) => {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string")
    return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0)
    return node.quasis.map((q) => q.value.cooked ?? "").join("");
  return null;
};

const countUniqueTokens = (msg) => {
  const re = /@([a-zA-Z0-9_]+)/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(msg)) !== null) seen.add(m[1]);
  return seen.size;
};

const missingTokenArgs = defineRule({
  meta: {
    type: "problem",
    schema: [],
    messages: {
      missing:
        'logger.{{method}} message has {{tokens}} @token(s) but only {{args}} replacement arg(s) — missing slots render as "null".',
    },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!isLoggerCallee(node.callee)) return;
        const msg = staticMessage(node.arguments[0]);
        if (msg === null) return;
        const tokens = countUniqueTokens(msg);
        const args = node.arguments.length - 1;
        if (args < tokens) {
          context.report({
            node,
            messageId: "missing",
            data: {
              method: node.callee.property.name,
              tokens: String(tokens),
              args: String(args),
            },
          });
        }
      },
    };
  },
});

const extraArgsWithoutToken = defineRule({
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      extra:
        "logger.{{method}} passes {{args}} arg(s) but the message has no @token placeholders — extras are appended at runtime; consider adding @tokens or inlining the value.",
    },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!isLoggerCallee(node.callee)) return;
        const msg = staticMessage(node.arguments[0]);
        if (msg === null) return;
        const tokens = countUniqueTokens(msg);
        const args = node.arguments.length - 1;
        if (tokens === 0 && args > 0) {
          context.report({
            node,
            messageId: "extra",
            data: {
              method: node.callee.property.name,
              args: String(args),
            },
          });
        }
      },
    };
  },
});

export default definePlugin({
  meta: { name: "logger" },
  rules: {
    "missing-token-args": missingTokenArgs,
    "extra-args-without-token": extraArgsWithoutToken,
  },
});
