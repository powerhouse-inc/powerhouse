import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Project } from "ts-morph";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateAllSubgraphs,
  generateSubgraph,
  SubgraphCheckError,
} from "../src/codegen/generate.js";
import { buildTsMorphProject } from "../src/utils/index.mts";
import { createCodeFirstPackage } from "./code-first-package.js";
import { hostGuard } from "./subgraph-host-guard.js";

let projectDir: string;

const path = (...segments: string[]) => join(projectDir, ...segments);
const read = (file: string) => readFileSync(path(file), "utf8");

function writeFiles(files: Record<string, string>) {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(path(file)), { recursive: true });
    writeFileSync(path(file), text);
  }
}

const subgraphClass = (className: string, subgraphName: string) =>
  `import { BaseSubgraph, type SchemaBuilder } from "@powerhousedao/reactor-api";
import { ph } from "document-model";

export class ${className} extends BaseSubgraph {
  static override readonly subgraphName = "${subgraphName}";
  static override getSchema(schema: SchemaBuilder<${className}>) {
    return [
      schema.query("${subgraphName}", { returns: ph.String(), resolve: () => "ok" }),
    ];
  }
}
`;

const manifest = `${JSON.stringify({ name: "@acme/things", subgraphs: [] }, null, 2)}\n`;

async function inProject(generate: (project: Project) => Promise<unknown>) {
  const project = buildTsMorphProject(projectDir);
  await generate(project);
  await project.save();
}

const manifestIds = () =>
  (
    JSON.parse(read("powerhouse.manifest.json")) as {
      subgraphs: { id: string }[];
    }
  ).subgraphs
    .map(({ id }) => id)
    .sort();

beforeEach(() => {
  projectDir = createCodeFirstPackage();
  writeFileSync(path("powerhouse.manifest.json"), manifest);
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("generateAllSubgraphs with an authored root entry", () => {
  it("keeps a class declared in the root entry and lists it", async () => {
    const barrel = subgraphClass("RootSubgraph", "root");
    writeFiles({ "subgraphs/index.ts": barrel });

    await inProject(generateAllSubgraphs);

    expect(read("subgraphs/index.ts")).toBe(barrel);
    expect(manifestIds()).toStrictEqual(["root"]);
  });

  it("keeps a re-export of a class declared outside subgraphs/", async () => {
    const authored = `export { ExternalSubgraph } from "../src/external.js";\n`;
    writeFiles({
      "src/external.ts": subgraphClass("ExternalSubgraph", "external"),
      "subgraphs/billing/index.ts": subgraphClass("BillingSubgraph", "billing"),
      "subgraphs/index.ts": authored,
    });

    await inProject(generateAllSubgraphs);

    expect(read("subgraphs/index.ts"))
      .toBe(`import type { SubgraphCheck } from "@powerhousedao/reactor-api";
import { BillingSubgraph } from "./billing/index.js";

export { ExternalSubgraph } from "../src/external.js";

${hostGuard("BillingSubgraph")}
export { BillingSubgraph };
const checkBillingSubgraph: SubgraphCheck<typeof BillingSubgraph> = true;
void checkBillingSubgraph;
`);
    expect(manifestIds()).toStrictEqual(["billing", "external"]);
  });

  it("keeps a root that nests a class in a container", async () => {
    const barrel = `import { DeepSubgraph } from "../src/deep.js";
export const nested = { child: { DeepSubgraph } };
`;
    writeFiles({
      "src/deep.ts": subgraphClass("DeepSubgraph", "deep"),
      "subgraphs/index.ts": barrel,
    });

    await inProject(generateAllSubgraphs);

    expect(read("subgraphs/index.ts")).toBe(barrel);
    expect(manifestIds()).toStrictEqual(["deep"]);
  });

  it("keeps two classes with the same name under their aliases", async () => {
    const barrel = `export { SharedSubgraph as One } from "./one/index.js";
export { SharedSubgraph as Two } from "./two/index.js";
`;
    writeFiles({
      "subgraphs/one/index.ts": subgraphClass("SharedSubgraph", "one"),
      "subgraphs/two/index.ts": subgraphClass("SharedSubgraph", "two"),
      "subgraphs/index.ts": barrel,
    });

    await inProject(generateAllSubgraphs);

    expect(read("subgraphs/index.ts")).toBe(barrel);
    expect(manifestIds()).toStrictEqual(["one", "two"]);
  });
});

describe("generateAllSubgraphs with statements the generator does not write", () => {
  it("keeps a namespace export verbatim and adds the subgraph it does not export", async () => {
    writeFiles({
      "subgraphs/billing/index.ts": `${subgraphClass("BillingSubgraph", "billing")}export const currency = "EUR";\n`,
      "subgraphs/payments/index.ts": subgraphClass(
        "PaymentsSubgraph",
        "payments",
      ),
      "subgraphs/index.ts": `export * as Billing from "./billing/index.js";\n`,
    });

    await inProject(generateAllSubgraphs);

    expect(read("subgraphs/index.ts"))
      .toBe(`import type { SubgraphCheck } from "@powerhousedao/reactor-api";
import { PaymentsSubgraph } from "./payments/index.js";

export * as Billing from "./billing/index.js";

${hostGuard("PaymentsSubgraph")}
export { PaymentsSubgraph };
const checkPaymentsSubgraph: SubgraphCheck<typeof PaymentsSubgraph> = true;
void checkPaymentsSubgraph;
`);
    expect(manifestIds()).toStrictEqual(["billing", "payments"]);
  });

  it("keeps a re-export and a differently spelled import verbatim", async () => {
    const barrel = `export { BillingSubgraph as Billing } from "./billing/index.js";
import { PaymentsSubgraph } from './payments/index.js';
export { PaymentsSubgraph };
`;
    writeFiles({
      "subgraphs/billing/index.ts": subgraphClass("BillingSubgraph", "billing"),
      "subgraphs/payments/index.ts": subgraphClass(
        "PaymentsSubgraph",
        "payments",
      ),
      "subgraphs/index.ts": barrel,
    });

    await inProject(generateAllSubgraphs);

    expect(read("subgraphs/index.ts")).toBe(barrel);
    expect(manifestIds()).toStrictEqual(["billing", "payments"]);
  });
});

// Regenerating through ts-morph takes several times longer on Windows.
describe("generateSubgraph", { timeout: 120_000 }, () => {
  it("keeps the comments above the generated statements it writes again", async () => {
    writeFiles({
      "subgraphs/billing/index.ts": subgraphClass("BillingSubgraph", "billing"),
      "subgraphs/index.ts": `import type { SubgraphCheck } from "@powerhousedao/reactor-api";
// Served at /graphql/billing.
import { BillingSubgraph } from "./billing/index.js";

/** The billing API. */
export { BillingSubgraph };
const checkBillingSubgraph: SubgraphCheck<typeof BillingSubgraph> = true;
void checkBillingSubgraph;
`,
    });
    const expected = `import type { SubgraphCheck } from "@powerhousedao/reactor-api";
// Served at /graphql/billing.
import { BillingSubgraph } from "./billing/index.js";
import { PaymentsSubgraph } from "./payments/index.js";

${hostGuard("BillingSubgraph")}
/** The billing API. */
export { BillingSubgraph };
const checkBillingSubgraph: SubgraphCheck<typeof BillingSubgraph> = true;
void checkBillingSubgraph;

export { PaymentsSubgraph };
const checkPaymentsSubgraph: SubgraphCheck<typeof PaymentsSubgraph> = true;
void checkPaymentsSubgraph;
`;

    await inProject((project) => generateSubgraph("payments", project));
    expect(read("subgraphs/index.ts")).toBe(expected);
    await inProject(generateAllSubgraphs);
    expect(read("subgraphs/index.ts")).toBe(expected);
    expect(manifestIds()).toStrictEqual(["billing", "payments"]);
  });

  it("refuses a root entry that does not parse before writing any file", async () => {
    writeFiles({ "subgraphs/index.ts": "export class Broken {\n" });

    await expect(
      inProject((project) => generateSubgraph("invoices", project)),
    ).rejects.toThrow(
      "PH-IMPORT-FAILED [error/import] ./subgraphs/index.ts (root): subgraphs/index.ts does not parse",
    );
    expect(existsSync(path("subgraphs/invoices"))).toBe(false);
    expect(read("subgraphs/index.ts")).toBe("export class Broken {\n");
    expect(read("powerhouse.manifest.json")).toBe(manifest);
  });

  it("runs beforeCheck once the scaffold is on disk and before loading it", async () => {
    const reactorApi = path("node_modules/@powerhousedao/reactor-api");
    unlinkSync(reactorApi);
    const seen: string[] = [];

    await inProject((project) =>
      generateSubgraph("Invoices", project, {
        beforeCheck: () => {
          seen.push(read("subgraphs/index.ts"));
          symlinkSync(
            fileURLToPath(new URL("../../reactor-api", import.meta.url)),
            reactorApi,
            "junction",
          );
          return Promise.resolve();
        },
      }),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain(
      'import { InvoicesSubgraph } from "./invoices/index.js";',
    );
    expect(
      (JSON.parse(read("powerhouse.manifest.json")) as { subgraphs: unknown })
        .subgraphs,
    ).toStrictEqual([{ name: "Invoices", id: "invoices" }]);
  });

  it("leaves the manifest unchanged when the check fails", async () => {
    writeFiles({
      "subgraphs/broken/index.ts": `throw new Error("broken");\n${subgraphClass("BrokenSubgraph", "broken")}`,
    });
    let ranBeforeCheck = false;

    const generation = inProject((project) =>
      generateSubgraph("invoices", project, {
        beforeCheck: () => {
          ranBeforeCheck = true;
          return Promise.resolve();
        },
      }),
    );

    await expect(generation).rejects.toThrow(SubgraphCheckError);
    await expect(generation).rejects.toThrow(
      "PH-IMPORT-FAILED [error/import] ./subgraphs/broken/index.ts (root): This definition source could not be imported.",
    );
    expect(ranBeforeCheck).toBe(true);
    expect(read("powerhouse.manifest.json")).toBe(manifest);
    expect(existsSync(path("subgraphs/invoices/index.ts"))).toBe(true);
  });
});
