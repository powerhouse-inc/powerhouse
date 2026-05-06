// Mixed-load k6 scenario for the switchboard LB.
//
// Setup creates N drives via `createDocument` with pre-minted UUIDs so the
// `Drive-Id` header used at creation time equals the drive's actual id.
// That keeps consistent-hash routing stable: every subsequent request with
// `Drive-Id: <id>` lands on the same backend that created and cached the
// drive, so the wrong-shard middleware never fires.
//
// Steady state: 60% mutateDocument (SET_DRIVE_NAME — schema-valid, no state
// growth), 40% document(identifier:) reads. Both pinned via Drive-Id.
//
// Run via `./test/integration/mixed-load.sh` — that wrapper brings up the
// real switchboard stack and the observability profile, then `docker compose
// run --rm loadtest-mixed`.

import http from "k6/http";
import { check } from "k6";

const LB_URL = __ENV.LB_URL || "http://lb:8080";
const NUM_DRIVES = parseInt(__ENV.NUM_DRIVES || "8", 10);
const VUS = parseInt(__ENV.VUS || "10", 10);
const DURATION = __ENV.DURATION || "3m";

export const options = {
  scenarios: {
    sustained: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: VUS },
        { duration: DURATION, target: VUS },
        { duration: "15s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

const CREATE_DOCUMENT_MUTATION = `
  mutation CreateDocument($document: JSONObject!, $parentIdentifier: String) {
    createDocument(document: $document, parentIdentifier: $parentIdentifier) {
      id
      documentType
    }
  }
`;

const MUTATE_DOCUMENT_MUTATION = `
  mutation MutateDocument($documentIdentifier: String!, $actions: [JSONObject!]!) {
    mutateDocument(documentIdentifier: $documentIdentifier, actions: $actions) {
      id
      revisionsList { scope revision }
    }
  }
`;

const READ_DOCUMENT_QUERY = `
  query GetDocument($identifier: String!) {
    document(identifier: $identifier) {
      document { id name documentType }
      childIds
    }
  }
`;

// RFC4122-ish v4. k6's Goja runtime has no crypto.randomUUID, but the only
// requirement here is that ids are unique within one test run and have
// enough entropy to spread across the consistent-hash ring.
function uuid() {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      s += "-";
    } else if (i === 14) {
      s += "4";
    } else if (i === 19) {
      s += hex[((Math.random() * 4) | 0) + 8];
    } else {
      s += hex[(Math.random() * 16) | 0];
    }
  }
  return s;
}

function nowIso() {
  return new Date().toISOString();
}

// Minimum drive document shape. Mirrors what
// `driveDocumentModelModule.utils.createDocument()` builds at
// packages/shared/document-drive/gen/utils.ts:54-65 plus the base
// header/state from packages/shared/document-model/{header,state,documents}.ts.
function buildDrive(id) {
  const ts = nowIso();
  const state = {
    auth: {},
    document: {
      version: 0,
      hash: { algorithm: "sha1", encoding: "base64" },
    },
    global: { name: "", icon: null, nodes: [] },
    local: {
      listeners: [],
      triggers: [],
      sharingType: "private",
      availableOffline: false,
    },
  };
  return {
    header: {
      id,
      sig: { publicKey: {}, nonce: "" },
      documentType: "powerhouse/document-drive",
      createdAtUtcIso: ts,
      slug: "",
      name: "",
      branch: "main",
      revision: { document: 0 },
      lastModifiedAtUtcIso: ts,
      meta: {},
    },
    state,
    initialState: state,
    operations: { global: [], local: [] },
    clipboard: [],
  };
}

function gqlPost(driveId, body, tag) {
  return http.post(`${LB_URL}/graphql`, JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Drive-Id": driveId,
    },
    tags: { name: tag },
  });
}

export function setup() {
  console.log(
    `[setup] creating ${NUM_DRIVES} drives at ${LB_URL} with pre-minted ids`,
  );
  const driveIds = [];
  for (let i = 0; i < NUM_DRIVES; i++) {
    const id = uuid();
    const res = gqlPost(
      id,
      {
        query: CREATE_DOCUMENT_MUTATION,
        variables: { document: buildDrive(id), parentIdentifier: null },
      },
      "create-drive",
    );
    if (res.status !== 200) {
      throw new Error(
        `drive creation failed: HTTP ${res.status} body=${res.body}`,
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(res.body);
    } catch (e) {
      throw new Error(`drive creation: invalid JSON body: ${res.body}`);
    }
    if (parsed.errors) {
      throw new Error(`drive creation: ${JSON.stringify(parsed.errors)}`);
    }
    const got = parsed.data && parsed.data.createDocument;
    if (!got || got.id !== id) {
      throw new Error(
        `drive creation: id mismatch — sent ${id}, server returned ${got && got.id}`,
      );
    }
    driveIds.push(id);
  }
  console.log(`[setup] created drives: ${driveIds.join(", ")}`);
  return { driveIds };
}

export default function (data) {
  const driveId =
    data.driveIds[Math.floor(Math.random() * data.driveIds.length)];
  const isMutation = Math.random() < 0.6;

  let res;
  if (isMutation) {
    res = gqlPost(
      driveId,
      {
        query: MUTATE_DOCUMENT_MUTATION,
        variables: {
          documentIdentifier: driveId,
          actions: [
            {
              id: uuid(),
              type: "SET_DRIVE_NAME",
              timestampUtcMs: nowIso(),
              input: { name: `lt-${Date.now()}` },
              scope: "global",
            },
          ],
        },
      },
      "mutate-drive",
    );
  } else {
    res = gqlPost(
      driveId,
      {
        query: READ_DOCUMENT_QUERY,
        variables: { identifier: driveId },
      },
      "read-drive",
    );
  }

  check(res, {
    "status 200": (r) => r.status === 200,
    "no graphql errors": (r) => {
      try {
        const b = JSON.parse(r.body);
        return !b.errors;
      } catch (e) {
        return false;
      }
    },
  });
}
