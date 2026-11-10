import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { gqlModule, installSubgraphDependencies } from "./subgraph-project.js";

/**
 * A schema-first subgraph with an object, an input with defaults, an enum,
 * a union and an interface with __resolveType, an object type only the
 * interface leads to, a computed field, root fields without a resolver (one
 * named like an `Object.prototype` member), a field config object behind an
 * identifier, a mutation, a subscription, `this` in its inline resolvers and
 * a protected BaseSubgraph helper.
 */
export const TWIN_FILES: Readonly<Record<string, string>> = {
  "subgraphs/catalog/schema.ts": gqlModule(`"""Anything the catalog lists."""
interface Node { id: ID! }
enum Status { DRAFT LIVE @deprecated(reason: "Use DRAFT.") }
type Book implements Node { id: ID! title: String! status: Status! label(prefix: String = "#"): String! }
type Film implements Node { id: ID! title: String! minutes: Int }
type Author implements Node { id: ID! name: String! }
union Item = Book | Film
input ItemFilter { status: Status = DRAFT limit: Int = 10 tags: [String!] = ["a"] }
type Viewer { address: String key: String }
type Query {
  items(filter: ItemFilter = { limit: 2 }): [Item!]!
  node(id: ID!): Node
  viewer: Viewer!
  greeting: String
  toString: String
  motto: String
  slogan: String
}
type Mutation { rename(id: ID!, title: String!): Book! }
type Subscription { renamed: Book! }`),
  "subgraphs/catalog/index.ts": `import { BaseSubgraph, type Context } from "@powerhousedao/reactor-api";
import { schema } from "./schema.js";

type BookRow = { id: string; title: string; status: string };
type FilmRow = { id: string; title: string; minutes: number };
type AuthorRow = { id: string; name: string };

const motto = { resolve: () => "Read more." };
class FieldConfig {
  resolve() {
    return "Read on.";
  }
}
const slogan = new FieldConfig();
type Filter = { status: string; limit: number; tags: string[] | null };

export class CatalogSubgraph extends BaseSubgraph {
  name = "catalog";
  typeDefs = schema;
  hasSubscriptions = true;
  #books: BookRow[] = [
    { id: "b1", title: "Dune", status: "DRAFT" },
    { id: "b2", title: "Emma", status: "LIVE" },
    { id: "b3", title: "Ulysses", status: "DRAFT" },
  ];
  #films: FilmRow[] = [{ id: "f1", title: "Alien", minutes: 117 }];
  #authors: AuthorRow[] = [{ id: "a1", name: "Le Guin" }];
  #listeners = new Set<(book: BookRow) => void>();

  resolvers = {
    Query: {
      items: (_parent: unknown, args: { filter: Filter }) => [
        ...this.#books
          .filter((book) => book.status === args.filter.status)
          .slice(0, args.filter.limit)
          .map((book) => ({ ...book, tags: args.filter.tags })),
        ...this.#films,
      ],
      node: (_parent: unknown, args: { id: string }) =>
        [...this.#books, ...this.#films, ...this.#authors].find(
          (node) => node.id === args.id,
        ),
      viewer: (_parent: unknown, _args: unknown, ctx: Context) =>
        this.viewSubject(ctx),
      motto,
      slogan,
    },
    Book: {
      label: (book: BookRow, args: { prefix: string }) =>
        \`\${args.prefix}\${book.id} \${this.name}\`,
    },
    Item: {
      __resolveType: (value: BookRow | FilmRow) =>
        "minutes" in value ? "Film" : "Book",
    },
    Node: {
      __resolveType: (value: BookRow | FilmRow | AuthorRow) =>
        "minutes" in value ? "Film" : "name" in value ? "Author" : "Book",
    },
    Mutation: {
      rename: (_parent: unknown, args: { id: string; title: string }) => {
        const book = this.#books.find((candidate) => candidate.id === args.id)!;
        book.title = args.title;
        for (const listener of this.#listeners) listener(book);
        return book;
      },
    },
    Subscription: {
      renamed: {
        subscribe: () => this.#renames(),
        resolve: (event: { book: BookRow }) => event.book,
      },
    },
  };

  async *#renames(): AsyncGenerator<{ book: BookRow }> {
    const queue: BookRow[] = [];
    let wake: (() => void) | undefined;
    const listener = (book: BookRow) => {
      queue.push({ ...book });
      wake?.();
    };
    this.#listeners.add(listener);
    try {
      for (;;) {
        const book = queue.shift();
        if (book) yield { book };
        else await new Promise<void>((resolve) => (wake = resolve));
      }
    } finally {
      this.#listeners.delete(listener);
    }
  }
}
`,
};

/** A temporary project with `files`, its package.json, and what subgraph modules import. */
export function writeProject(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "ph-migrate-subgraphs-"));
  const all: Record<string, string> = {
    "package.json": `${JSON.stringify(
      {
        name: "@acme/catalog",
        version: "1.0.0",
        type: "module",
        peerDependencies: {
          "@powerhousedao/reactor-api": "^6.2.0",
          "document-model": "^6.2.0",
        },
        devDependencies: {
          "@powerhousedao/reactor-api": "^6.2.0",
          "document-model": "^6.2.0",
        },
      },
      null,
      2,
    )}\n`,
    "powerhouse.config.json": "{}\n",
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  installSubgraphDependencies(root);
  return root;
}

/** Every file of the project outside node_modules, by relative path. */
export function snapshot(root: string, dir = root): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      Object.assign(files, snapshot(root, path));
    } else if (entry.isFile()) {
      files[relative(root, path)] = readFileSync(path, "utf8");
    }
  }
  return files;
}
