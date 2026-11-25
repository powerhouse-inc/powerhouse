import {
  Kind,
  parse,
  type DefinitionNode,
  type FieldDefinitionNode,
  type InputValueDefinitionNode,
  type TypeNode,
} from "graphql/language";

export const SCHEMA_GRAPH_LIMITS = {
  sourceCharacters: 500_000,
  tokens: 80_000,
  declarations: 150,
  links: 500,
  membersShown: 16,
} as const;

export type SchemaDeclarationKind =
  | "type"
  | "interface"
  | "input"
  | "enum"
  | "union"
  | "scalar";

export type SchemaMember =
  | {
      kind: "field";
      label: string;
      type: string;
      typeDeclaration: string | null;
    }
  | { kind: "value"; label: string }
  | { kind: "member"; label: string; typeDeclaration: string | null };

export type SchemaDeclaration = {
  name: string;
  kind: SchemaDeclarationKind;
  members: SchemaMember[];
};

export type SchemaLink = {
  source: string;
  target: string;
  member: number | "implements";
};

export type SchemaGraph = {
  declarations: SchemaDeclaration[];
  links: SchemaLink[];
  linkedPairs: number;
  omittedDeclarations: number;
  omittedLinks: number;
};

export type SchemaGraphResult =
  | { ok: true; graph: SchemaGraph }
  | { ok: false; reason: "too_large" | "invalid"; message: string };

type Declared = Extract<DefinitionNode, { name: { value: string } }>;

const KIND: Partial<Record<Kind, SchemaDeclarationKind>> = {
  [Kind.OBJECT_TYPE_DEFINITION]: "type",
  [Kind.OBJECT_TYPE_EXTENSION]: "type",
  [Kind.INTERFACE_TYPE_DEFINITION]: "interface",
  [Kind.INTERFACE_TYPE_EXTENSION]: "interface",
  [Kind.INPUT_OBJECT_TYPE_DEFINITION]: "input",
  [Kind.INPUT_OBJECT_TYPE_EXTENSION]: "input",
  [Kind.ENUM_TYPE_DEFINITION]: "enum",
  [Kind.ENUM_TYPE_EXTENSION]: "enum",
  [Kind.UNION_TYPE_DEFINITION]: "union",
  [Kind.UNION_TYPE_EXTENSION]: "union",
  [Kind.SCALAR_TYPE_DEFINITION]: "scalar",
  [Kind.SCALAR_TYPE_EXTENSION]: "scalar",
};

function written(type: TypeNode): string {
  switch (type.kind) {
    case Kind.NAMED_TYPE:
      return type.name.value;
    case Kind.LIST_TYPE:
      return `[${written(type.type)}]`;
    case Kind.NON_NULL_TYPE:
      return `${written(type.type)}!`;
  }
}

function named(type: TypeNode): string {
  return type.kind === Kind.NAMED_TYPE ? type.name.value : named(type.type);
}

type Draft =
  | { kind: "field"; label: string; type: string; own: string; args: string[] }
  | { kind: "value"; label: string }
  | { kind: "member"; label: string; own: string };

function fieldDraft(
  field: FieldDefinitionNode | InputValueDefinitionNode,
): Draft {
  const args = "arguments" in field ? (field.arguments ?? []) : [];
  const names = args.map((arg) => arg.name.value);
  const label =
    names.length === 0
      ? field.name.value
      : `${field.name.value}(${names.slice(0, 2).join(", ")}${names.length > 2 ? ", …" : ""})`;
  return {
    kind: "field",
    label,
    type: written(field.type),
    own: named(field.type),
    args: args.map((arg) => named(arg.type)),
  };
}

function drafts(node: Declared): { members: Draft[]; implements: string[] } {
  switch (node.kind) {
    case Kind.OBJECT_TYPE_DEFINITION:
    case Kind.OBJECT_TYPE_EXTENSION:
    case Kind.INTERFACE_TYPE_DEFINITION:
    case Kind.INTERFACE_TYPE_EXTENSION:
      return {
        members: (node.fields ?? []).map(fieldDraft),
        implements: (node.interfaces ?? []).map((i) => i.name.value),
      };
    case Kind.INPUT_OBJECT_TYPE_DEFINITION:
    case Kind.INPUT_OBJECT_TYPE_EXTENSION:
      return { members: (node.fields ?? []).map(fieldDraft), implements: [] };
    case Kind.ENUM_TYPE_DEFINITION:
    case Kind.ENUM_TYPE_EXTENSION:
      return {
        members: (node.values ?? []).map((value): Draft => ({
          kind: "value",
          label: value.name.value,
        })),
        implements: [],
      };
    case Kind.UNION_TYPE_DEFINITION:
    case Kind.UNION_TYPE_EXTENSION:
      return {
        members: (node.types ?? []).map((member): Draft => ({
          kind: "member",
          label: member.name.value,
          own: member.name.value,
        })),
        implements: [],
      };
    default:
      return { members: [], implements: [] };
  }
}

export function schemaGraph(sdl: string): SchemaGraphResult {
  if (sdl.length > SCHEMA_GRAPH_LIMITS.sourceCharacters) {
    return {
      ok: false,
      reason: "too_large",
      message: `The diagram draws schemas of up to ${SCHEMA_GRAPH_LIMITS.sourceCharacters.toLocaleString("en-US")} characters.`,
    };
  }
  let document: ReturnType<typeof parse>;
  try {
    document = parse(sdl, {
      maxTokens: SCHEMA_GRAPH_LIMITS.tokens,
      noLocation: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(`${SCHEMA_GRAPH_LIMITS.tokens} tokens`)) {
      return {
        ok: false,
        reason: "too_large",
        message: `The diagram draws schemas of up to ${SCHEMA_GRAPH_LIMITS.tokens.toLocaleString("en-US")} tokens.`,
      };
    }
    return {
      ok: false,
      reason: "invalid",
      message,
    };
  }

  const found = new Map<
    string,
    { kind: SchemaDeclarationKind; members: Draft[]; implements: string[] }
  >();
  for (const definition of document.definitions) {
    const kind = KIND[definition.kind];
    if (!kind) continue;
    const node = definition as Declared;
    const parts = drafts(node);
    const known = found.get(node.name.value);
    if (!known) {
      found.set(node.name.value, { kind, ...parts });
      continue;
    }
    const key = (m: Draft) => `${m.label}:${m.kind === "field" ? m.type : ""}`;
    const labels = new Set(known.members.map(key));
    known.members.push(...parts.members.filter((m) => !labels.has(key(m))));
    known.implements.push(...parts.implements);
  }

  const shown = [...found.entries()].slice(0, SCHEMA_GRAPH_LIMITS.declarations);
  const names = new Set(shown.map(([name]) => name));
  const typeDeclaration = (name: string) => (names.has(name) ? name : null);

  const links: SchemaLink[] = [];
  const linked = new Set<string>();
  let dropped = 0;
  const link = (
    source: string,
    target: string,
    member: SchemaLink["member"],
  ) => {
    const key = `${source}\0${member}\0${target}`;
    if (linked.has(key)) return;
    linked.add(key);
    if (!names.has(target)) {
      if (found.has(target)) dropped++;
      return;
    }
    links.push({ source, target, member });
  };
  const declarations = shown.map(
    ([name, { kind, members, implements: implemented }]) => {
      members.forEach((member, index) => {
        if (member.kind === "value") return;
        link(name, member.own, index);
        if (member.kind === "field") {
          for (const target of member.args) link(name, target, index);
        }
      });
      for (const target of implemented) link(name, target, "implements");
      return {
        name,
        kind,
        members: members.map((member): SchemaMember => {
          switch (member.kind) {
            case "field":
              return {
                kind: "field",
                label: member.label,
                type: member.type,
                typeDeclaration: typeDeclaration(member.own),
              };
            case "member":
              return {
                kind: "member",
                label: member.label,
                typeDeclaration: typeDeclaration(member.own),
              };
            case "value":
              return member;
          }
        }),
      };
    },
  );

  const kept = links.slice(0, SCHEMA_GRAPH_LIMITS.links);
  return {
    ok: true,
    graph: {
      declarations,
      links: kept,
      linkedPairs: new Set(kept.map((l) => `${l.source}\0${l.target}`)).size,
      omittedDeclarations: found.size - shown.length,
      omittedLinks: links.length - kept.length + dropped,
    },
  };
}
