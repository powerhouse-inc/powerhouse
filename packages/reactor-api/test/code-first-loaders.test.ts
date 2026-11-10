/**
 * A subgraph package holding a code-first class and a plain BaseSubgraph
 * class, served through the Vite dev server with a live reload, unload and
 * replacement, and through the HTTP registry. The package imports both bases
 * from `@powerhousedao/reactor-api` by name, as a published package does, so
 * it extends the built copy of reactor-api while the host runs from source.
 */
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { HttpPackageLoader } from "../src/packages/http-loader.js";
import {
  startViteServer,
  VitePackageLoader,
} from "../src/packages/vite-loader.mjs";
import { Subgraph } from "../src/graphql/code-first/subgraph.js";
import type { SubgraphClass } from "../src/graphql/types.js";
import {
  type CodeFirstHost,
  startCodeFirstHost,
} from "./utils/code-first-host.js";

const PACKAGE = "@acme/greetings";

/** A subgraph module, in the JavaScript a package build emits. */
const greeting = (className: string, name: string, value: string) => `
import { ph } from "document-model";
import { BaseSubgraph, Subgraph } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";

export class GreetingBase extends Subgraph {}

export class ${className} extends GreetingBase {
  static subgraphName = "${name}";
  static getSchema(schema) {
    return [
      schema.query("greeting", {
        args: { to: ph.String({ required: true }) },
        type: ph.String({ required: true }),
        resolve: ({ args, subgraph }) => subgraph.greet(args.to),
      }),
    ];
  }
  greet(to) {
    return "${value}, " + to;
  }
}

export class SdlGreetingSubgraph extends BaseSubgraph {
  name = "sdl-greeting";
  typeDefs = gql\`
    type Query {
      sdlGreeting(to: String!): String!
    }
  \`;
  resolvers = {
    Query: { sdlGreeting: (_, { to }) => "${value}, " + to },
  };
}
`;

// The shape codegen's subgraphs index emits.
const INDEX = `export * as GreetingSubgraph from "./greeting/index.js";\n`;

const GREETING = '{ greeting(to: "Ada") }';
const SDL_GREETING = '{ sdlGreeting(to: "Ada") }';

let root = "";

async function write(file: string, contents: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, contents);
}

async function link(dir: string, dependency: string, target: string) {
  await mkdir(dirname(join(dir, "node_modules", dependency)), {
    recursive: true,
  });
  await symlink(
    await realpath(target),
    join(dir, "node_modules", dependency),
    "junction",
  );
}

async function packageDir(name: string): Promise<string> {
  const dir = join(root, name);
  await write(
    join(dir, "package.json"),
    JSON.stringify({ name: PACKAGE, version: "1.0.0", type: "module" }),
  );
  const own = resolve(import.meta.dirname, "..");
  await link(dir, "document-model", join(own, "node_modules/document-model"));
  await link(dir, "zod", join(own, "node_modules/zod"));
  await link(dir, "graphql-tag", join(own, "node_modules/graphql-tag"));
  await link(dir, "@powerhousedao/reactor-api", own);
  await write(join(dir, "subgraphs/index.js"), INDEX);
  await write(
    join(dir, "subgraphs/greeting/index.js"),
    greeting("GreetingSubgraph", "greeting", "Hello"),
  );
  return dir;
}

let host: CodeFirstHost | undefined;

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "code-first-subgraphs-")));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

afterEach(async () => {
  await host?.close();
  host = undefined;
});

async function serve(subgraphs: SubgraphClass[]) {
  host ??= await startCodeFirstHost();
  await host.applyPackage(PACKAGE, subgraphs);
  return host;
}

const names = (subgraphs: SubgraphClass[]) => subgraphs.map((it) => it.name);

/** Whether `subgraph` extends the host's own `Subgraph`, not another copy's. */
const extendsHostCopy = (subgraph: SubgraphClass) =>
  Object.prototype.isPrototypeOf.call(Subgraph, subgraph);

describe("VitePackageLoader", () => {
  let vite: ViteDevServer;
  let dir = "";

  beforeAll(async () => {
    dir = await packageDir("vite");
    vite = await startViteServer(dir);
  }, 60_000);

  afterAll(async () => {
    await vite.close();
  });

  it("serves a mixed package and follows a live reload, unload and replacement", async () => {
    const loader = VitePackageLoader.build(vite);
    const loaded = await loader.loadSubgraphs(dir);
    expect(loaded.map(extendsHostCopy)).toEqual([false, false]);
    const current = await serve(loaded);
    expect(await current.post("/graphql/greeting", GREETING)).toEqual({
      data: { greeting: "Hello, Ada" },
    });
    expect(await current.post("/graphql/sdl-greeting", SDL_GREETING)).toEqual({
      data: { sdlGreeting: "Hello, Ada" },
    });

    const applied: string[][] = [];
    let changed = () => {};
    const unsubscribe = loader.onSubgraphsChange(
      dir,
      (subgraphs) => {
        void current.applyPackage(PACKAGE, subgraphs).then(() => {
          applied.push(names(subgraphs));
          changed();
        });
      },
      { debounce: 0 },
    );
    const edit = async (file: string, contents: string) => {
      const done = new Promise<void>((resolve) => (changed = resolve));
      await writeFile(join(dir, "subgraphs", file), contents);
      await done;
    };

    try {
      // Reload: the same subgraph, a new class.
      await edit(
        "greeting/index.js",
        greeting("GreetingSubgraph", "greeting", "Hi"),
      );
      expect(await current.post("/graphql/greeting", GREETING)).toEqual({
        data: { greeting: "Hi, Ada" },
      });
      expect(await current.post("/graphql/sdl-greeting", SDL_GREETING)).toEqual(
        { data: { sdlGreeting: "Hi, Ada" } },
      );

      // Unload: the package exports no subgraph.
      await edit("index.js", "export {};\n");
      expect(current.manager.getSubgraphByName("greeting")).toBe(undefined);
      expect(current.manager.getSubgraphByName("sdl-greeting")).toBe(undefined);

      // Replacement: another code-first subgraph under another name.
      await edit(
        "greeting/index.js",
        greeting("WelcomeSubgraph", "welcome", "Welcome"),
      );
      await edit("index.js", INDEX);
      expect(await current.post("/graphql/welcome", GREETING)).toEqual({
        data: { greeting: "Welcome, Ada" },
      });
      expect(current.manager.getSubgraphByName("greeting")).toBe(undefined);
      // The module edit while the index exports nothing reloads nothing.
      expect(applied).toEqual([
        ["GreetingSubgraph", "SdlGreetingSubgraph"],
        [],
        [],
        ["SdlGreetingSubgraph", "WelcomeSubgraph"],
      ]);
    } finally {
      unsubscribe();
    }
  }, 60_000);
});

describe("HttpPackageLoader", () => {
  let server: Server;
  let registryUrl = "";
  const files = new Map<string, string>();
  const cdn = `/-/cdn/${PACKAGE}@1.0.0/`;

  beforeAll(async () => {
    files.set(`/-/cdn/${PACKAGE}/package.json`, '{"version":"1.0.0"}');
    files.set(`${cdn}package.json`, '{"version":"1.0.0"}');
    files.set(
      `${cdn}node/subgraphs/index.mjs`,
      'export * as GreetingSubgraph from "./greeting/index.mjs";\n',
    );
    files.set(
      `${cdn}node/subgraphs/greeting/index.mjs`,
      greeting("GreetingSubgraph", "greeting", "Hey"),
    );
    server = createServer((request, response) => {
      const body = files.get(
        decodeURIComponent(new URL(request.url!, "http://x").pathname),
      );
      response.statusCode = body === undefined ? 404 : 200;
      response.setHeader("content-type", "application/javascript");
      response.end(body);
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    registryUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  });

  afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()));
  });

  it("serves a mixed package from the registry cache", async () => {
    const loader = new HttpPackageLoader({
      registryUrl,
      cacheDir: join(root, "http", ".ph", "registry-packages"),
    });
    const subgraphs = await loader.loadSubgraphs(PACKAGE);
    expect(names(subgraphs)).toEqual([
      "GreetingSubgraph",
      "SdlGreetingSubgraph",
    ]);
    expect(subgraphs.map(extendsHostCopy)).toEqual([false, false]);
    const current = await serve(subgraphs);
    expect(await current.post("/graphql/greeting", GREETING)).toEqual({
      data: { greeting: "Hey, Ada" },
    });
    expect(await current.post("/graphql/sdl-greeting", SDL_GREETING)).toEqual({
      data: { sdlGreeting: "Hey, Ada" },
    });
  });
});
