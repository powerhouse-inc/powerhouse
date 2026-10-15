const pnpm = (args, cwd = ".", timeoutMs = 120_000) => ({
  argv: ["pnpm", ...args],
  cwd,
  timeoutMs,
});
const build = (name) =>
  pnpm(
    [
      "-r",
      "--workspace-concurrency=1",
      "--filter",
      `${name}...`,
      "run",
      "build",
    ],
    ".",
    1_800_000,
  );
const toolingInputs = [
  "scripts/agent-context.mjs",
  "scripts/verify-task.mjs",
  "scripts/verification-profiles.mjs",
  "scripts/test/agent-workflow.test.mjs",
];
const tools = [
  pnpm(["--version"]),
  { argv: ["bun", "--version"], timeoutMs: 10_000 },
];
const test = (cwd, ...files) =>
  pnpm(["exec", "vitest", "run", ...files], cwd, 600_000);

export function verificationProfile(name, env = process.env) {
  switch (name) {
    case "tooling":
      return {
        name,
        inputs: toolingInputs,
        preflight: [],
        builds: [],
        outputs: [],
        checks: [
          {
            argv: [
              process.execPath,
              "--test",
              "scripts/test/agent-workflow.test.mjs",
            ],
            timeoutMs: 120_000,
          },
        ],
      };
    case "cli-runtime":
      return {
        name,
        inputs: ["."],
        prerequisites: ["node_modules/.bin/vitest"],
        preflight: tools,
        builds: [build("@powerhousedao/ph-cli")],
        outputs: [
          "clis/ph-cli/dist/cli.mjs",
          "packages/document-model/dist/index.js",
        ],
        checks: [
          test(
            "clis/ph-cli",
            "test/loader-node.test.ts",
            "test/built-cli.test.ts",
          ),
        ],
      };
    case "subgraph":
      return {
        name,
        inputs: ["."],
        prerequisites: ["node_modules/.bin/vitest"],
        preflight: tools,
        builds: [build("@powerhousedao/reactor-api")],
        outputs: ["packages/document-model/dist/index.js"],
        checks: [test("packages/reactor-api", "test/define-subgraph.test.ts")],
      };
    case "reactor-pg": {
      const databaseEnv = {
        REACTOR_TEST_PG_URL: env.REACTOR_TEST_PG_URL ?? "",
      };
      const probe = `
        if (!process.env.REACTOR_TEST_PG_URL) throw new Error('Set REACTOR_TEST_PG_URL for the PostgreSQL test instance');
        const { Client } = await import('pg');
        const client = new Client({ connectionString: process.env.REACTOR_TEST_PG_URL, connectionTimeoutMillis: 3000 });
        try {
          await client.connect();
          const { rows } = await client.query('SELECT rolcreatedb OR rolsuper AS allowed FROM pg_roles WHERE rolname = current_user');
          if (!rows[0]?.allowed) throw new Error('The test PostgreSQL role requires CREATEDB');
          console.log('PostgreSQL connection and test privileges verified');
        } finally { await client.end(); }
      `;
      return {
        name,
        inputs: ["."],
        prerequisites: ["node_modules/.bin/vitest"],
        preflight: [
          ...tools,
          {
            argv: [process.execPath, "--input-type=module", "-e", probe],
            cwd: "packages/reactor-workflow",
            timeoutMs: 10_000,
            env: databaseEnv,
          },
        ],
        builds: [build("@powerhousedao/reactor-workflow")],
        outputs: ["packages/document-model/dist/index.js"],
        checks: [
          {
            ...test(
              "packages/reactor-workflow",
              "src/reactor/workflow-triggers-read-model.purge.test.ts",
            ),
            env: databaseEnv,
          },
        ],
      };
    }
    default:
      throw new Error(
        `Unknown profile ${name}. Choose tooling, cli-runtime, subgraph or reactor-pg.`,
      );
  }
}
