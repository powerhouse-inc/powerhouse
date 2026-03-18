import { createClient } from "graphql-ws";
import WebSocket from "ws";

// --- CLI argument parsing ---
const args = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

const url = getArg("url", "ws://localhost:4001/graphql/subscriptions");
const typeFilter = getArg("type", "");
const parentId = getArg("parent-id", "");
const jobId = getArg("job-id", "");
const authToken = getArg("auth", "");

if (hasFlag("help")) {
  console.log(`Usage: tsx src/index.ts [options]

Options:
  --url <url>      WebSocket URL (default: ws://localhost:4001/graphql/subscriptions)
  --type <type>    Filter documentChanges by document type
  --parent-id <id> Filter documentChanges by parent document (drive) ID
  --job-id <id>    Also subscribe to jobChanges for a specific job
  --auth <token>   Bearer token for authentication
  --help           Show this help message`);
  process.exit(0);
}

// --- Timestamps ---
function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

// --- Client setup ---
console.log(`[${ts()}] Connecting to ${url}...`);

const client = createClient({
  url,
  webSocketImpl: WebSocket,
  connectionParams: authToken
    ? { authorization: `Bearer ${authToken}` }
    : undefined,
  on: {
    connected: () => console.log(`[${ts()}] Connected`),
    closed: (event) => console.log(`[${ts()}] Connection closed`, event),
    error: (error) => console.error(`[${ts()}] Connection error:`, error),
  },
});

// --- documentChanges subscription ---
const search: Record<string, unknown> = {};
if (typeFilter) search.type = typeFilter;
if (parentId) search.parentId = parentId;

const docQuery = `
  subscription DocumentChanges($search: SearchFilterInput!) {
    documentChanges(search: $search) {
      type
      documents {
        id
        slug
        name
        documentType
        createdAtUtcIso
        lastModifiedAtUtcIso
        revisionsList {
          scope
          revision
        }
      }
      context {
        parentId
        childId
      }
    }
  }
`;

console.log(
  `[${ts()}] Subscribing to documentChanges${typeFilter ? ` (type: ${typeFilter})` : ""}${parentId ? ` (parentId: ${parentId})` : ""}...`,
);

const docCleanup = client.subscribe(
  { query: docQuery, variables: { search } },
  {
    next: (data) => {
      const event = (data.data as Record<string, unknown>)?.documentChanges as
        | Record<string, unknown>
        | undefined;
      if (!event) {
        console.log(
          `[${ts()}] documentChanges:`,
          JSON.stringify(data, null, 2),
        );
        return;
      }
      const docs = event.documents as Array<Record<string, unknown>>;
      const docSummaries = docs
        .map((d) => `${d.name || d.slug || d.id} (${d.documentType})`)
        .join(", ");
      console.log(
        `[${ts()}] documentChanges [${event.type}] ${docSummaries}`,
        event.context ? `context: ${JSON.stringify(event.context)}` : "",
      );
    },
    error: (err) => console.error(`[${ts()}] documentChanges error:`, err),
    complete: () =>
      console.log(`[${ts()}] documentChanges subscription complete`),
  },
);

// --- jobChanges subscription (optional) ---
let jobCleanup: (() => void) | undefined;

if (jobId) {
  const jobQuery = `
    subscription JobChanges($jobId: String!) {
      jobChanges(jobId: $jobId) {
        jobId
        status
        result
        error
      }
    }
  `;

  console.log(`[${ts()}] Subscribing to jobChanges (jobId: ${jobId})...`);

  jobCleanup = client.subscribe(
    { query: jobQuery, variables: { jobId } },
    {
      next: (data) => {
        const event = (data.data as Record<string, unknown>)?.jobChanges as
          | Record<string, unknown>
          | undefined;
        if (!event) {
          console.log(`[${ts()}] jobChanges:`, JSON.stringify(data, null, 2));
          return;
        }
        console.log(
          `[${ts()}] jobChanges [${event.status}] job=${event.jobId}`,
          event.error ? `error: ${event.error}` : "",
        );
      },
      error: (err) => console.error(`[${ts()}] jobChanges error:`, err),
      complete: () => console.log(`[${ts()}] jobChanges subscription complete`),
    },
  );
}

// --- Clean shutdown ---
function shutdown() {
  console.log(`\n[${ts()}] Shutting down...`);
  docCleanup();
  jobCleanup?.();
  client.dispose();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[${ts()}] Listening for events. Press Ctrl+C to stop.`);
