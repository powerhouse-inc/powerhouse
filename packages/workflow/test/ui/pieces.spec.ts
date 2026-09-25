// Popular pieces run end to end on the live stack, against services the test
// starts itself: nothing here needs an account or the public internet.
import { execFileSync } from "node:child_process";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createConnectionInBrowser,
  createSecret,
  createWorkflowInBrowser,
  fireAndWait,
  gql,
  pieceBlockType,
  pieceTriggerBlockType,
} from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

const MANUAL = { blockType: "core#manual", config: {} };

test.describe("HTTP", () => {
  let server: Server;
  let port = 0;
  const seen: { url?: string; headers: IncomingHttpHeaders }[] = [];

  test.beforeAll(async () => {
    server = createServer((request, response) => {
      seen.push({ url: request.url, headers: request.headers });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true, path: request.url }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as AddressInfo).port;
  });

  test.afterAll(() => server.close());

  test("send_request calls the URL and hands on the JSON it got back", async ({
    stack,
  }) => {
    const id = await createWorkflowInBrowser(stack.page, stack.drive, {
      name: "HTTP echo",
      trigger: MANUAL,
      steps: [
        {
          key: "call",
          name: "Call echo",
          blockType: await pieceBlockType(
            "@activepieces/piece-http",
            "send_request",
          ),
          config: {
            method: "GET",
            url: `http://127.0.0.1:${port}/echo?from=workflow`,
            headers: { "x-run-tag": "{{trigger.payload.tag}}" },
          },
        },
        {
          key: "parse",
          name: "Parse the echoed path",
          blockType: await pieceBlockType(
            "@activepieces/piece-http",
            "parse_url",
          ),
          // A later step reads an earlier one's output by its full reference.
          config: {
            url: `http://127.0.0.1:${port}{{steps.call.output.body.path}}`,
          },
        },
      ],
    });
    const run = await fireAndWait(id, { tag: "piece-test" });
    expect(run.status, run.error ?? "").toBe("SUCCEEDED");
    expect(run.steps[0].output).toMatchObject({
      status: 200,
      body: { ok: true, path: "/echo?from=workflow" },
    });
    expect(run.steps[1].output).toMatchObject({ path: "/echo" });
    // The header came from the trigger payload, through an expression.
    expect(
      seen.some((request) => request.headers["x-run-tag"] === "piece-test"),
    ).toBe(true);
  });
});

test.describe("Store", () => {
  test("a value put in one step is read back by the next, run after run", async ({
    stack,
  }) => {
    const put = await pieceBlockType("@activepieces/piece-store", "put");
    const get = await pieceBlockType("@activepieces/piece-store", "get");
    const id = await createWorkflowInBrowser(stack.page, stack.drive, {
      name: "Store round trip",
      trigger: MANUAL,
      steps: [
        {
          key: "put",
          name: "Remember",
          blockType: put,
          config: {
            key: "greeting",
            value: "{{trigger.payload.value}}",
            store_scope: "COLLECTION",
          },
        },
        {
          key: "get",
          name: "Recall",
          blockType: get,
          config: { key: "greeting", store_scope: "COLLECTION" },
        },
      ],
    });
    for (const value of ["hello", "hello again"]) {
      const run = await fireAndWait(id, { value });
      expect(run.status, run.error ?? "").toBe("SUCCEEDED");
      expect(run.steps.find((step) => step.stepKey === "get")?.output).toBe(
        value,
      );
    }
  });
});

test.describe("Schedule", () => {
  test("an enabled schedule is armed at its interval and can be tried", async ({
    stack,
  }) => {
    const id = await createWorkflowInBrowser(stack.page, stack.drive, {
      name: "Every minute",
      trigger: {
        blockType: await pieceTriggerBlockType(
          "@activepieces/piece-schedule",
          "every_x_minutes",
        ),
        config: { minutes: 1 },
      },
      steps: [],
    });
    type State = {
      workflowId: string;
      status: string;
      intervalMs: number;
      nextPollAt: string | null;
      lastError: string | null;
    };
    // The supervisor arms it on its next tick once the document has synced.
    await expect
      .poll(
        async () => {
          const data = await gql<{
            workflowRuntime: { triggerStates: State[] };
          }>(
            "/graphql/workflow-runtime",
            `{ workflowRuntime { triggerStates { workflowId status intervalMs nextPollAt lastError } } }`,
          );
          return data.workflowRuntime.triggerStates.find(
            (state) => state.workflowId === id,
          );
        },
        { timeout: 60_000, intervals: [1000] },
      )
      .toMatchObject({
        status: "ENABLED",
        intervalMs: 60_000,
        lastError: null,
      });

    const tried = await gql<{ workflowRuntime: { testTrigger: unknown } }>(
      "/graphql/workflow-runtime",
      `mutation($id: String!) { workflowRuntime { testTrigger(workflowId: $id) } }`,
      { id },
    );
    expect(tried.workflowRuntime.testTrigger).toBeTruthy();
  });
});

function dockerAvailable(): boolean {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

test.describe("Postgres", () => {
  test.skip(!dockerAvailable(), "needs Docker for a throwaway Postgres");

  const container = `wf-pieces-pg-${process.pid}`;
  const pgPort = 55_000 + (process.pid % 1000);

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    execFileSync("docker", [
      "run",
      "-d",
      "--rm",
      "--name",
      container,
      "-e",
      "POSTGRES_PASSWORD=pieces",
      "-p",
      `127.0.0.1:${pgPort}:5432`,
      "postgres:16-alpine",
    ]);
    const deadline = Date.now() + 120_000;
    for (;;) {
      try {
        execFileSync(
          "docker",
          [
            "exec",
            container,
            "pg_isready",
            "-U",
            "postgres",
            "-h",
            "127.0.0.1",
          ],
          { stdio: "ignore" },
        );
        return;
      } catch {
        if (Date.now() > deadline) throw new Error("Postgres never came up");
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  });

  test.afterAll(() => {
    try {
      execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" });
    } catch {
      // Already gone.
    }
  });

  test("a connection checks out and a workflow writes and reads rows", async ({
    stack,
  }) => {
    const password = await createSecret("pieces", "Postgres test password");
    const connectionId = await createConnectionInBrowser(
      stack.page,
      stack.drive,
      {
        name: "Local Postgres",
        connectorId: "@activepieces/piece-postgres#postgres",
        authType: "CUSTOM_AUTH",
        config: {
          host: "127.0.0.1",
          port: pgPort,
          user: "postgres",
          database: "postgres",
          enable_ssl: false,
          reject_unauthorized: false,
        },
        secrets: { password },
      },
    );

    // The piece's own validate, over the stored secret.
    await expect
      .poll(
        async () => {
          const data = await gql<{
            workflowRuntime: {
              checkConnection: { ok: boolean; detail: string };
            };
          }>(
            "/graphql/workflow-runtime",
            `mutation($id: String!) { workflowRuntime { checkConnection(connectionId: $id) { ok detail } } }`,
            { id: connectionId },
          ).catch((error: unknown) => ({
            workflowRuntime: {
              checkConnection: { ok: false, detail: String(error) },
            },
          }));
          return data.workflowRuntime.checkConnection;
        },
        { timeout: 30_000, intervals: [1000] },
      )
      .toMatchObject({ ok: true });

    const query = await pieceBlockType(
      "@activepieces/piece-postgres",
      "run-query",
    );
    const id = await createWorkflowInBrowser(stack.page, stack.drive, {
      name: "Postgres notes",
      trigger: MANUAL,
      steps: [
        {
          key: "create",
          name: "Create table",
          blockType: query,
          connectionId,
          config: {
            query:
              "CREATE TABLE IF NOT EXISTS notes (id serial PRIMARY KEY, body text NOT NULL)",
          },
        },
        {
          key: "insert",
          name: "Insert note",
          blockType: query,
          connectionId,
          config: {
            query: "INSERT INTO notes (body) VALUES ($1) RETURNING body",
            args: ["{{trigger.payload.body}}"],
          },
        },
      ],
    });
    const run = await fireAndWait(id, { body: "written by a workflow" });
    expect(run.status, run.error ?? "").toBe("SUCCEEDED");
    expect(
      JSON.stringify(run.steps.find((step) => step.stepKey === "insert")),
    ).toContain("written by a workflow");
    // Straight from the database, not the step's own report.
    const rows = execFileSync("docker", [
      "exec",
      container,
      "psql",
      "-U",
      "postgres",
      "-tAc",
      "SELECT body FROM notes",
    ]).toString();
    expect(rows.trim()).toBe("written by a workflow");
  });
});
