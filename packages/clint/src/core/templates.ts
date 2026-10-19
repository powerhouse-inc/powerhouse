import Handlebars from "handlebars";

/**
 * Known helper names — both custom defaults and Handlebars built-ins.
 * Used by extractTemplateVars to filter out helper references.
 */
const KNOWN_HELPERS = new Set([
  // registered helpers
  "formatDate",
  "join",
  "exists",
  "eq",
  "uppercase",
  "lowercase",
  "hasItems",
  "default",
  // built-in block helpers
  "if",
  "unless",
  "each",
  "with",
  "lookup",
  "log",
]);

/**
 * Register the 8 standard Handlebars helpers on a Handlebars instance.
 */
export function registerDefaultHelpers(hbs: typeof Handlebars): void {
  hbs.registerHelper("formatDate", (date: unknown, format: string) => {
    if (!date) return "";
    const d = new Date(date as string);
    if (format === "time") return d.toLocaleTimeString();
    if (format === "date") return d.toLocaleDateString();
    return d.toISOString();
  });
  hbs.registerHelper("join", (arr: unknown[], sep: string) =>
    Array.isArray(arr) ? arr.join(typeof sep === "string" ? sep : ", ") : "",
  );
  hbs.registerHelper(
    "exists",
    (value: unknown) => value !== undefined && value !== null && value !== "",
  );
  hbs.registerHelper("eq", (a: unknown, b: unknown) => a === b);
  hbs.registerHelper("uppercase", (s: unknown) =>
    typeof s === "string" ? s.toUpperCase() : "",
  );
  hbs.registerHelper("lowercase", (s: unknown) =>
    typeof s === "string" ? s.toLowerCase() : "",
  );
  hbs.registerHelper(
    "hasItems",
    (arr: unknown) => Array.isArray(arr) && arr.length > 0,
  );
  hbs.registerHelper("default", (value: unknown, defaultValue: unknown) =>
    value !== undefined && value !== null && value !== ""
      ? value
      : defaultValue,
  );
}

/**
 * Walk a Handlebars AST and return all top-level variable names referenced.
 * Filters out known helpers and built-in block helpers.
 */
export function extractTemplateVars(template: string): Set<string> {
  const ast = Handlebars.parse(template);
  const vars = new Set<string>();

  const visitor = new Handlebars.Visitor();

  function collectParams(params?: hbs.AST.Expression[]) {
    if (!params) return;
    for (const p of params) {
      if (p.type === "PathExpression") {
        const expr = p as hbs.AST.PathExpression;
        const root = expr.parts[0] as string | undefined;
        if (
          root &&
          !KNOWN_HELPERS.has(expr.original) &&
          !expr.data &&
          expr.depth === 0
        ) {
          vars.add(root);
        }
      }
    }
  }

  visitor.MustacheStatement = function (stmt: hbs.AST.MustacheStatement) {
    const p = stmt.path;
    if (p.type === "PathExpression") {
      const expr = p as hbs.AST.PathExpression;
      const root = expr.parts[0] as string | undefined;
      if (
        root &&
        !KNOWN_HELPERS.has(expr.original) &&
        !expr.data &&
        expr.depth === 0
      ) {
        vars.add(root);
      }
    }
    collectParams(stmt.params);
    Handlebars.Visitor.prototype.MustacheStatement.call(this, stmt);
  };

  visitor.SubExpression = function (sexpr: hbs.AST.SubExpression) {
    collectParams(sexpr.params);
    Handlebars.Visitor.prototype.SubExpression.call(this, sexpr);
  };

  visitor.BlockStatement = function (block: hbs.AST.BlockStatement) {
    collectParams(block.params);
    Handlebars.Visitor.prototype.BlockStatement.call(this, block);
  };

  visitor.accept(ast);
  return vars;
}

/**
 * Options for renderSkillTemplate.
 */
export interface RenderOptions {
  /** Additional Handlebars helpers to register alongside defaults. */
  helpers?: Record<string, (...args: unknown[]) => unknown>;
  /** Additional known helper names to exclude from missing-variable detection. */
  knownHelpers?: string[];
}

/**
 * Result of rendering a skill template.
 */
export interface RenderResult {
  rendered: string;
  warnings: string[];
}

/**
 * Render a Handlebars template with default helpers and missing-variable detection.
 * Uses Handlebars.create() for isolation — no global state pollution.
 */
export function renderSkillTemplate(
  template: string,
  context: Record<string, unknown>,
  options?: RenderOptions,
): RenderResult {
  const hbs = Handlebars.create();
  registerDefaultHelpers(hbs);

  // Register custom helpers
  if (options?.helpers) {
    for (const [name, fn] of Object.entries(options.helpers)) {
      hbs.registerHelper(name, fn);
    }
  }

  // Detect missing variables
  const vars = extractTemplateVars(template);
  const contextKeys = new Set(Object.keys(context));
  const extraKnown = options?.knownHelpers
    ? new Set(options.knownHelpers)
    : new Set<string>();
  const customHelperNames = options?.helpers
    ? new Set(Object.keys(options.helpers))
    : new Set<string>();

  const warnings: string[] = [];
  for (const v of [...vars].sort()) {
    if (
      !contextKeys.has(v) &&
      !extraKnown.has(v) &&
      !customHelperNames.has(v)
    ) {
      warnings.push(
        `Template references "{{${v}}}" but context has no value for it`,
      );
    }
  }

  const compiled = hbs.compile(template, { noEscape: true });
  const rendered = compiled(context);

  return { rendered, warnings };
}
