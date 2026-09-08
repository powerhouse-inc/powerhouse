// In-process stand-in for docling-serve v1 (1.32.0 surface). Implements only
// what the piece calls, with enough fidelity to test auth, sync/async,
// polling, backpressure and failure mapping. Offline by construction.
import http from "node:http";
import type { AddressInfo } from "node:net";

export const MOCK_MD = "# Mock doc\n\nParagraph one.";
export const MOCK_JSON = { version: "1.7.0", records: [{ subject: "Mock Document" }] };
export const MOCK_HTML = "<h1>Mock doc</h1><p>Paragraph one.</p>";
export const MOCK_TEXT = "Mock doc Paragraph one.";
export const MOCK_DOCTAGS = "<docling><document><text>Mock doc</text></document></docling>";
export const MOCK_CHUNKS = [
  { text: "chunk one", page_no: 1, start_chunk_no: 1, end_chunk_no: 1 },
  { text: "chunk two", page_no: 1, start_chunk_no: 2, end_chunk_no: 2 },
];

export interface MockDoclingOptions {
  apiKey?: string;
  failAuthAlways?: boolean;
  syncSlow?: boolean;
  failJobs?: string[];
  backpressure?: number;
  neverFinish?: boolean;
}

export interface MockDocling {
  baseUrl: string;
  close(): Promise<void>;
  requests: Array<{
    method: string;
    path: string;
    query: URLSearchParams;
    headers: Record<string, string | string[]>;
  }>;
  requestBodies: string[];
  pollCount: number;
}

interface Task {
  id: string;
  polls: number;
  failing: boolean;
  filename: string;
  formats: string[];
  kind: "convert" | "chunk";
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown, headers?: Record<string, string>): void {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function documentPayload(filename: string, formats: string[]) {
  return {
    filename,
    md_content: formats.includes("md") ? MOCK_MD : null,
    json_content: formats.includes("json") ? MOCK_JSON : null,
    html_content: formats.includes("html") ? MOCK_HTML : null,
    text_content: formats.includes("text") ? MOCK_TEXT : null,
    doctags_content: formats.includes("doctags") ? MOCK_DOCTAGS : null,
  };
}

function successResponse(filename: string, formats: string[]) {
  return {
    document: documentPayload(filename, formats),
    status: "success",
    errors: [],
    processing_time: 0.4,
  };
}

export async function startMockDocling(opts: MockDoclingOptions = {}): Promise<MockDocling> {
  const tasks = new Map<string, Task>();
  const requests: MockDocling["requests"] = [];
  const requestBodies: string[] = [];
  let pollCount = 0;
  let seq = 0;
  let backpressureLeft = opts.backpressure ?? 0;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    requests.push({
      method: req.method ?? "",
      path: url.pathname,
      query: url.searchParams,
      headers: req.headers as Record<string, string | string[]>,
    });

    if (opts.failAuthAlways || (opts.apiKey && req.headers["x-api-key"] !== opts.apiKey)) {
      return json(res, 401, { detail: "Invalid API Key." });
    }

    const p = url.pathname;
    if (req.method === "GET" && p === "/health") return json(res, 200, { status: "ok" });
    if (req.method === "GET" && p === "/version") {
      // Key set mirrors the real 1.32.0 DOCLING_VERSIONS, including the
      // upstream "plaform" typo.
      return json(res, 200, {
        "docling-serve": "1.32.0",
        docling: "2.126.0",
        "docling-core": "2.126.0",
        "docling-parse": "2.126.0",
        "docling-jobkit": "1.32.0",
        python: "3.11.9",
        plaform: "linux",
      });
    }

    let body: {
      sources?: Array<{ kind?: string; base64_string?: string; filename?: string; url?: string }>;
      options?: { to_formats?: string[] };
    } = {};
    if (req.method === "POST") {
      try {
        const raw = await readBody(req);
        requestBodies.push(raw);
        // JSON.parse is `any`-typed; narrow to the declared body shape.
        body = JSON.parse(raw || "{}") as typeof body;
      } catch {
        return json(res, 422, { detail: "invalid JSON" });
      }
    }

    const isConvert = p.startsWith("/v1/convert");
    const isChunk = p.startsWith("/v1/chunk");
    const isAsync = p.endsWith("/async");
    const isSync = isConvert || isChunk;

    if (isSync && !isAsync && opts.syncSlow) return json(res, 504, { detail: "sync timeout" });
    if (isSync && backpressureLeft > 0) {
      backpressureLeft--;
      return json(res, 429, { detail: "server busy" }, { "retry-after": "0" });
    }

    if (isSync && isAsync) {
      const sources = body.sources ?? [];
      if (sources.length === 0) return json(res, 422, { detail: "sources must be non-empty" });
      const filename = sources[0]?.filename ?? sources[0]?.url ?? "doc";
      const id = `task-${++seq}`;
      tasks.set(id, {
        id,
        polls: 0,
        failing: (opts.failJobs ?? []).includes(sources[0]?.filename ?? ""),
        filename: String(filename).split("/").pop() ?? "doc",
        formats: body.options?.to_formats ?? ["md"],
        kind: p.startsWith("/v1/chunk") ? "chunk" : "convert",
      });
      return json(res, 200, {
        task_id: id,
        task_type: p.startsWith("/v1/chunk") ? "chunk" : "convert",
        task_status: "pending",
        task_position: 1,
        task_meta: { num_docs: sources.length, num_processed: 0 },
      });
    }

    if (req.method === "GET" && p.startsWith("/v1/status/poll/")) {
      const id = p.slice("/v1/status/poll/".length);
      const task = tasks.get(id);
      if (!task) return json(res, 404, { detail: "task not found" });
      pollCount++;
      const done = opts.neverFinish ? false : task.polls >= 1 || task.failing;
      task.polls++;
      if (!done) {
        return json(res, 200, {
          task_id: id,
          task_status: "started",
          task_meta: { num_docs: 1, num_processed: 0 },
        });
      }
      return json(res, 200, {
        task_id: id,
        task_status: task.failing ? "failure" : "success",
        task_meta: { num_docs: 1, num_processed: 1, num_succeeded: task.failing ? 0 : 1 },
        failure: task.failing
          ? { category: "inference_failure", message: "mock inference failure", retryable: false }
          : null,
      });
    }

    if (req.method === "GET" && p.startsWith("/v1/result/")) {
      const id = p.slice("/v1/result/".length);
      const task = tasks.get(id);
      if (!task) return json(res, 404, { detail: "task not found" });
      if (task.failing) {
        return json(res, 200, {
          task_id: id,
          failure: { category: "inference_failure", message: "mock inference failure", retryable: false },
        });
      }
      if (task.kind === "chunk") {
        return json(res, 200, { chunks: MOCK_CHUNKS, processing_time: 0.3 });
      }
      return json(res, 200, successResponse(task.filename, task.formats));
    }

    if (req.method === "POST" && isSync) {
      const sources = body.sources ?? [];
      if (sources.length === 0) return json(res, 422, { detail: "sources must be non-empty" });
      const first = sources[0]; // guarded by the empty check above
      if (first.kind === "http" && String(first.url).endsWith(".zip")) {
        return json(res, 422, { detail: "zip sources are not supported" });
      }
      const filename = first.filename ?? String(first.url ?? "doc").split("/").pop() ?? "doc";
      if (p.startsWith("/v1/chunk")) {
        return json(res, 200, { chunks: MOCK_CHUNKS, processing_time: 0.3 });
      }
      if ((opts.failJobs ?? []).includes(first.filename ?? "")) {
        return json(res, 200, {
          document: null,
          status: "failure",
          errors: [{ category: "inference_failure", error_message: "mock inference failure" }],
          processing_time: 0.1,
        });
      }
      return json(res, 200, successResponse(String(filename), body.options?.to_formats ?? ["md"]));
    }

    return json(res, 404, { detail: `no route ${p}` });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
    requests,
    requestBodies,
    get pollCount() {
      return pollCount;
    },
  };
}
