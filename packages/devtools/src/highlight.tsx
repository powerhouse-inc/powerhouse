import type { ReactNode } from "react";

export type CodeLang = "graphql" | "json" | "typescript";

type Kind =
  | "keyword"
  | "type"
  | "field"
  | "string"
  | "number"
  | "constant"
  | "variable"
  | "comment"
  | "punct"
  | "plain";

const TOKEN_CLASS: Record<Kind, string> = {
  keyword: "text-chart-5",
  type: "text-chart-2",
  field: "text-info",
  string: "text-success",
  number: "text-warning",
  constant: "text-warning",
  variable: "text-chart-4",
  comment: "text-muted-foreground italic",
  punct: "text-muted-foreground",
  plain: "",
};

const GQL_KEYWORDS = new Set([
  "type",
  "input",
  "enum",
  "scalar",
  "union",
  "interface",
  "extend",
  "schema",
  "directive",
  "query",
  "mutation",
  "subscription",
  "fragment",
  "on",
  "implements",
  "repeatable",
]);
const GQL_LITERALS = new Set(["true", "false", "null"]);
const DECLARES = new Set([
  "type",
  "input",
  "enum",
  "scalar",
  "union",
  "interface",
  "fragment",
  "on",
  "implements",
]);

const GQL_TOKEN =
  /(#[^\n]*)|("""[\s\S]*?"""|"(?:\\.|[^"\\\n])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([$@][A-Za-z_]\w*)|([A-Za-z_]\w*)|([{}()[\]!:=|,&.]+)|(\s+)|(.)/g;

function tokenizeGraphql(code: string): [Kind, string][] {
  const out: [Kind, string][] = [];
  let prevWord = "";
  let prevPunct = "";
  for (const m of code.matchAll(GQL_TOKEN)) {
    const [text, comment, str, num, sigil, name, punct] = m;
    if (comment) out.push(["comment", text]);
    else if (str) out.push(["string", text]);
    else if (num) out.push(["number", text]);
    else if (sigil) out.push(["variable", text]);
    else if (name) {
      let kind: Kind;
      const typePosition =
        (DECLARES.has(prevWord) && prevPunct === "") ||
        /[:[|=&]$/.test(prevPunct);
      if (GQL_KEYWORDS.has(name)) kind = "keyword";
      else if (GQL_LITERALS.has(name)) kind = "constant";
      else if (typePosition) kind = "type";
      else if (/^[a-z_]/.test(name)) kind = "field";
      else if (/^[A-Z][A-Z0-9_]*$/.test(name)) kind = "constant";
      else kind = "type";
      out.push([kind, text]);
      prevWord = name;
      prevPunct = "";
    } else if (punct) {
      out.push(["punct", text]);
      prevPunct = text;
    } else out.push(["plain", text]);
  }
  return out;
}

const JSON_TOKEN =
  /("(?:\\.|[^"\\\n])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|([{}[\],:]+)|(\s+)|(.)/g;

function tokenizeJson(code: string): [Kind, string][] {
  const out: [Kind, string][] = [];
  for (const m of code.matchAll(JSON_TOKEN)) {
    const [text, str, colon, num, literal, punct] = m;
    if (str) {
      out.push([colon ? "field" : "string", str]);
      if (colon) out.push(["punct", colon]);
    } else if (num) out.push(["number", text]);
    else if (literal) out.push(["keyword", text]);
    else if (punct) out.push(["punct", text]);
    else out.push(["plain", text]);
  }
  return out;
}

const TS_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "of",
  "return",
  "satisfies",
  "switch",
  "throw",
  "try",
  "type",
  "typeof",
  "var",
  "void",
  "while",
  "yield",
]);
const TS_LITERALS = new Set(["true", "false", "null", "undefined", "this"]);

const TS_TOKEN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?)|([A-Za-z_$][\w$]*)|(\s+)|([^\sA-Za-z_$\d"'`/]+|[\s\S])/g;

function tokenizeTypescript(code: string): [Kind, string][] {
  const out: [Kind, string][] = [];
  for (const m of code.matchAll(TS_TOKEN)) {
    const [text, comment, str, num, name, space] = m;
    if (comment) out.push(["comment", text]);
    else if (str) out.push(["string", text]);
    else if (num) out.push(["number", text]);
    else if (name) {
      let kind: Kind = "plain";
      if (TS_KEYWORDS.has(name)) kind = "keyword";
      else if (TS_LITERALS.has(name)) kind = "constant";
      else if (/^[A-Z]/.test(name)) kind = "type";
      out.push([kind, text]);
    } else if (space) out.push(["plain", text]);
    else out.push(["punct", text]);
  }
  return out;
}

const TOKENIZERS: Record<CodeLang, (code: string) => [Kind, string][]> = {
  graphql: tokenizeGraphql,
  json: tokenizeJson,
  typescript: tokenizeTypescript,
};

export function highlight(code: string, lang: CodeLang): ReactNode {
  const tokens = TOKENIZERS[lang](code);
  return (
    <>
      {tokens.map(([kind, text], i) =>
        kind === "plain" ? (
          text
        ) : (
          <span key={i} className={TOKEN_CLASS[kind]}>
            {text}
          </span>
        ),
      )}
    </>
  );
}
