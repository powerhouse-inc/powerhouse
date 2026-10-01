import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createPGliteDatabase } from "../src/db/database.js";
import { migrate } from "../src/db/migrations.js";
import { enqueue } from "../src/jobs.js";
import {
  databaseMetrics,
  Metrics,
  routeGroup,
  serveMetrics,
} from "../src/metrics.js";

describe("metrics", () => {
  it("renders counters, histograms and gauges in the text format", async () => {
    const metrics = new Metrics();
    metrics.counter("c_total", "A counter").inc({ path: 'a"b\\c' }, 2);
    const h = metrics.histogram("h_seconds", "A histogram", [0.1, 1]);
    h.observe({ k: "x" }, 0.05);
    h.observe({ k: "x" }, 0.5);
    metrics.gauge("g", "A gauge", () => [{ value: 3 }]);
    expect(await metrics.render()).toBe(
      [
        "# HELP c_total A counter",
        "# TYPE c_total counter",
        'c_total{path="a\\"b\\\\c"} 2',
        "# HELP h_seconds A histogram",
        "# TYPE h_seconds histogram",
        'h_seconds_bucket{k="x",le="0.1"} 1',
        'h_seconds_bucket{k="x",le="1"} 2',
        'h_seconds_bucket{k="x",le="+Inf"} 2',
        'h_seconds_sum{k="x"} 0.55',
        'h_seconds_count{k="x"} 2',
        "# HELP g A gauge",
        "# TYPE g gauge",
        "g 3",
        "",
      ].join("\n"),
    );
  });

  it("leaves out a gauge that fails to collect", async () => {
    const metrics = new Metrics();
    metrics.gauge("bad", "Fails", () => Promise.reject(new Error("down")));
    metrics.gauge("good", "Works", () => [{ value: 1 }]);
    expect(await metrics.render()).not.toContain("bad");
  });

  it("groups routes into a few label values", () => {
    expect(routeGroup("GET", "/-/cdn/pkg@1.0.0/index.js")).toBe("cdn");
    expect(routeGroup("GET", "/-/pieces/bundled/@a/b/1.0.0.tgz")).toBe(
      "piece-bundle",
    );
    expect(routeGroup("GET", "/@scope/pkg/-/pkg-1.0.0.tgz")).toBe("tarball");
    expect(routeGroup("GET", "/@scope%2fpkg")).toBe("npm-metadata");
    expect(routeGroup("PUT", "/pkg")).toBe("npm-write");
    expect(routeGroup("GET", "/packages")).toBe("packages");
    expect(routeGroup("GET", "/pieces/@a/b/versions")).toBe("pieces");
  });

  it("reports the queue by priority, and serves it for the worker", async () => {
    const db = await createPGliteDatabase();
    await migrate(db);
    await enqueue(db, "sync", "a", "", {}, 10);
    await enqueue(db, "process", "b", "1.0.0");
    await db.query(
      "UPDATE registry_jobs SET run_after = now() - interval '1 minute' WHERE package = 'b'",
    );
    const metrics = new Metrics();
    databaseMetrics(metrics, db);
    const server = await serveMetrics(metrics, 0);
    try {
      const port = (server.address() as AddressInfo).port;
      const body = await (
        await fetch(`http://localhost:${port}/-/metrics`)
      ).text();
      expect(body).toContain('registry_jobs{priority="0"} 1');
      expect(body).toContain('registry_jobs{priority="10"} 1');
      expect(body).toMatch(
        /registry_jobs_oldest_due_seconds\{priority="0"\} 6\d/,
      );
      expect(body).toContain("registry_listen_connected 1");
      expect((await fetch(`http://localhost:${port}/metrics`)).status).toBe(
        404,
      );
    } finally {
      server.close();
      await db.close();
    }
  });

  it("reports every priority at 0 while the queue is empty", async () => {
    const db = await createPGliteDatabase();
    await migrate(db);
    const metrics = new Metrics();
    databaseMetrics(metrics, db);
    try {
      const body = await metrics.render();
      for (const gauge of [
        "registry_jobs",
        "registry_jobs_due",
        "registry_jobs_running",
        "registry_jobs_oldest_due_seconds",
      ]) {
        for (const priority of ["0", "5", "10"]) {
          expect(body).toContain(`${gauge}{priority="${priority}"} 0`);
        }
      }
    } finally {
      await db.close();
    }
  });
});
