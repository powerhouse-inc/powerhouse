// D1 baseline / scaling-matrix k6 driver. Talks to the bench-host shim:
//   setup()  creates NUM_DRIVES drives via POST /create
//   default  picks a random drive and POSTs SET_DRIVE_NAME via /mutate
//
// Throughput is measured server-side via Prometheus (reactor.queue.jobs.*).
// k6 itself reports request rate + latency for sanity-checking the shim.

import http from "k6/http";
import { check, fail } from "k6";

const BENCH_URL = __ENV.BENCH_URL || "http://bench-host:8080";
const NUM_DRIVES = parseInt(__ENV.NUM_DRIVES || "8", 10);
const VUS = parseInt(__ENV.VUS || "32", 10);
const DURATION = __ENV.DURATION || "60s";

export const options = {
  scenarios: {
    sustained: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: VUS },
        { duration: DURATION, target: VUS },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
  },
};

function post(path, body, tag) {
  return http.post(`${BENCH_URL}${path}`, JSON.stringify(body ?? {}), {
    headers: { "Content-Type": "application/json" },
    tags: { name: tag },
    timeout: "30s",
  });
}

export function setup() {
  console.log(
    `[setup] creating ${NUM_DRIVES} drives at ${BENCH_URL} (VUS=${VUS}, duration=${DURATION})`,
  );
  const driveIds = [];
  for (let i = 0; i < NUM_DRIVES; i++) {
    const res = post("/create", {}, "create");
    if (res.status !== 200) {
      fail(`drive creation failed: HTTP ${res.status} body=${res.body}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(res.body);
    } catch (e) {
      fail(`drive creation: invalid JSON body: ${res.body}`);
    }
    if (!parsed.driveId) {
      fail(`drive creation: missing driveId in ${res.body}`);
    }
    driveIds.push(parsed.driveId);
  }
  console.log(`[setup] created ${driveIds.length} drives`);
  return { driveIds };
}

export default function (data) {
  const driveId =
    data.driveIds[Math.floor(Math.random() * data.driveIds.length)];
  const res = post(
    "/mutate",
    { driveId, name: `lt-${Date.now()}-${__VU}-${__ITER}` },
    "mutate",
  );
  check(res, {
    "status 200": (r) => r.status === 200,
    "has jobId": (r) => {
      try {
        return Boolean(JSON.parse(r.body).jobId);
      } catch (e) {
        return false;
      }
    },
  });
}
