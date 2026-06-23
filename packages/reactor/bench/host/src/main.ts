// Bench host shim. Boots a reactor (in-process or worker-pool depending on
// REACTOR_WORKERS) backed by Postgres, exposes the OTel meter provider on
// :9090/metrics, and serves three endpoints over HTTP:
//
//   POST /create   -> creates a drive document, returns { driveId, jobId }
//   POST /mutate   -> signs a SET_DRIVE_NAME action and enqueues it
//   GET  /healthz  -> 200 once ready, 503 otherwise
//
// k6 talks to /create + /mutate; Prometheus scrapes the metrics exporter.
import "./observability.js";
import {
  instrumentPgPool,
  JobStatus,
  ReactorBuilder,
  type Database,
  type DocumentModelSpecInput,
  type InProcessReactorModule,
} from "@powerhousedao/reactor";
import { ReactorInstrumentation } from "@powerhousedao/opentelemetry-instrumentation-reactor";
import type {
  Action,
  ISigner,
  Signature,
} from "@powerhousedao/shared/document-model";
import {
  driveDocumentModelModule,
  setDriveName,
} from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely, PostgresDialect } from "kysely";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  registerEventLoopInstrumentation,
  type EventLoopInstrumentation,
} from "./eventLoopInstrumentation.js";
import { makeBenchSigner } from "./keypair.js";

const PORT = parseInt(process.env.PORT ?? "8080", 10);
const REACTOR_WORKERS = parseInt(process.env.REACTOR_WORKERS ?? "0", 10);
const DB_HOST = process.env.REACTOR_DB_HOST ?? "postgres";
const DB_PORT = parseInt(process.env.REACTOR_DB_PORT ?? "5432", 10);
const DB_NAME = process.env.REACTOR_DB_NAME ?? "reactor";
const DB_USER = process.env.REACTOR_DB_USER ?? "reactor";
const DB_PASSWORD = process.env.REACTOR_DB_PASSWORD ?? "reactor";
const DB_POOL_SIZE_HOST = parseInt(
  process.env.REACTOR_DB_POOL_SIZE_HOST ?? "16",
  10,
);
const DB_POOL_SIZE_WORKER = parseInt(
  process.env.REACTOR_DB_POOL_SIZE_WORKER ?? "2",
  10,
);
const DB_POOL_SIZE_PROJECTION = parseInt(
  process.env.REACTOR_DB_POOL_SIZE_PROJECTION ?? "16",
  10,
);
const DB_ACQUIRE_TIMEOUT_MS = parseInt(
  process.env.REACTOR_DB_ACQUIRE_TIMEOUT_MS ?? "5000",
  10,
);
const N_PROJECTION_SHARDS = parseInt(
  process.env.N_PROJECTION_SHARDS ?? "0",
  10,
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type State = {
  module: InProcessReactorModule;
  instrumentation: ReactorInstrumentation;
  signer: ISigner;
};

async function buildReactor(signer: ISigner): Promise<State> {
  const builder = new ReactorBuilder().withSignatureVerifier(() =>
    Promise.resolve(true),
  );

  const hostPool = new pg.Pool({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    application_name: "reactor-bench-host",
    max: DB_POOL_SIZE_HOST,
    connectionTimeoutMillis: DB_ACQUIRE_TIMEOUT_MS,
  });
  const hostPoolInstrumentation = instrumentPgPool(hostPool, "host");
  const hostKysely = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: hostPool }),
  });
  builder.withKysely(hostKysely).withInstrumentedPool(hostPoolInstrumentation);

  if (REACTOR_WORKERS > 0) {
    const modelFile = path.resolve(__dirname, "./document-model.mjs");
    const verifierFile = path.resolve(__dirname, "./signature-verifier.mjs");
    const specs: DocumentModelSpecInput[] = [{ filePath: modelFile }];
    builder
      .withDocumentModelLoader({
        load: (documentType: string) => {
          if (documentType === "powerhouse/document-drive") {
            return Promise.resolve(driveDocumentModelModule);
          }
          return Promise.reject(
            new Error(`bench-host has no loader for ${documentType}`),
          );
        },
      })
      .withDocumentModelSpecs(specs)
      .withWorkerPool({
        enabled: true,
        numWorkers: REACTOR_WORKERS,
        workerType: "thread",
      })
      .withWorkerDbConfig({
        host: DB_HOST,
        port: DB_PORT,
        database: DB_NAME,
        user: DB_USER,
        password: DB_PASSWORD,
        applicationName: "reactor-bench-worker",
        poolSize: DB_POOL_SIZE_WORKER,
        connectionTimeoutMillis: DB_ACQUIRE_TIMEOUT_MS,
      })
      .withWorkerSignatureVerifierSpec({
        module: {
          filePath: verifierFile,
          exportName: "createVerifier",
        },
      });
    if (N_PROJECTION_SHARDS > 0) {
      builder.withProjectionShards({
        shardCount: N_PROJECTION_SHARDS,
        preReadyKinds: ["document-view", "document-indexer"],
        postReadyKinds: [],
        poolSize: DB_POOL_SIZE_PROJECTION,
      });
    }
  } else {
    builder.withDocumentModels([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ]);
  }

  const module = await builder.buildModule();
  const instrumentation = new ReactorInstrumentation(module);
  instrumentation.start();
  return { module, instrumentation, signer };
}

async function signAction<A extends Action>(
  signer: ISigner,
  action: A,
): Promise<A> {
  const signature: Signature = await signer.signAction(action);
  return {
    ...action,
    context: {
      ...(action.context ?? {}),
      signer: {
        user: {
          address: signer.user?.address ?? "",
          networkId: signer.user?.networkId ?? "",
          chainId: signer.user?.chainId ?? 0,
        },
        app: {
          name: signer.app?.name ?? "reactor-bench",
          key: signer.app?.key ?? "",
        },
        signatures: [signature],
      },
    },
  } as A;
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf-8");
      if (body.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err as Error);
      }
    });
    req.on("error", reject);
  });
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload).toString(),
  });
  res.end(payload);
}

async function waitForJob(
  state: State,
  jobId: string,
  timeoutMs = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = state.module.jobTracker.getJobStatus(jobId);
    if (info) {
      if (
        info.status === JobStatus.WRITE_READY ||
        info.status === JobStatus.READ_READY
      ) {
        return;
      }
      if (info.status === JobStatus.FAILED) {
        throw new Error(`job ${jobId} failed: ${info.error?.message ?? ""}`);
      }
    }
    await new Promise<void>((r) => setTimeout(r, 25));
  }
  throw new Error(`timeout waiting for job ${jobId}`);
}

async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: State,
): Promise<void> {
  if (req.method === "GET" && req.url === "/healthz") {
    send(res, 200, { ready: true });
    return;
  }
  if (req.method === "POST" && req.url === "/create") {
    const document = driveDocumentModelModule.utils.createDocument();
    const info = await state.module.reactor.create(document, state.signer);
    await waitForJob(state, info.id);
    send(res, 200, { driveId: document.header.id, jobId: info.id });
    return;
  }
  if (req.method === "POST" && req.url === "/mutate") {
    const body = (await readJson(req)) as { driveId?: string; name?: string };
    if (!body.driveId) {
      send(res, 400, { error: "driveId required" });
      return;
    }
    const action = setDriveName({ name: body.name ?? `lt-${Date.now()}` });
    const signed = await signAction(state.signer, action);
    const info = await state.module.reactor.execute(body.driveId, "main", [
      signed,
    ]);
    send(res, 200, { jobId: info.id });
    return;
  }
  send(res, 404, { error: "not found" });
}

async function startHttp(state: State): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    void handle(req, res, state).catch((err: Error) => {
      send(res, 500, { error: err.message });
    });
  });
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(
    `[bench-host] listening on :${PORT} (REACTOR_WORKERS=${REACTOR_WORKERS})`,
  );
  return server;
}

async function main(): Promise<void> {
  console.log(
    `[bench-host] starting (REACTOR_WORKERS=${REACTOR_WORKERS}, N_PROJECTION_SHARDS=${N_PROJECTION_SHARDS}, DB=${DB_HOST}:${DB_PORT}/${DB_NAME})`,
  );
  const eventLoopInstrumentation: EventLoopInstrumentation =
    registerEventLoopInstrumentation();
  const { signer } = await makeBenchSigner();
  const state = await buildReactor(signer);
  const server = await startHttp(state);

  const shutdown = async (signal: string) => {
    console.log(`[bench-host] received ${signal}, shutting down`);
    server.close();
    state.instrumentation.stop();
    eventLoopInstrumentation.stop();
    try {
      const status = state.module.reactor.kill();
      await status.completed;
    } catch (err) {
      console.error("[bench-host] kill failed", err);
    }
    try {
      await state.module.database.destroy();
    } catch (err) {
      console.error("[bench-host] database.destroy failed", err);
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: Error) => {
  console.error("[bench-host] fatal", err);
  process.exit(1);
});
