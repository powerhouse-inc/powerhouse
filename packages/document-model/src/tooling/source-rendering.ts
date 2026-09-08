const TYPESCRIPT_RESERVED_WORDS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

/** Whether a value can be emitted as an unquoted JavaScript binding name. */
export function isTypeScriptIdentifier(value: string): boolean {
  return (
    /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) &&
    !TYPESCRIPT_RESERVED_WORDS.has(value)
  );
}

/** Encodes one value for a generated JavaScript expression. */
export function quoteJavaScriptValue(value: unknown): string {
  const encoded: unknown = JSON.stringify(value);
  if (typeof encoded !== "string") {
    throw new TypeError(
      "A generated JavaScript value must be JSON-compatible.",
    );
  }
  return encoded;
}
