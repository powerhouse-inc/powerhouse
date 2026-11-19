import { availableParallelism, totalmem } from "node:os";

const GiB = 1024 ** 3;

// Vitest owners run in the reference checkout; scenarios that install, build or publish get a private copy.
const CHECKOUT = "checkout:reference";

export const runsInPlace = (job) =>
  ["vitest", "node"].includes(job.runner) && !job.labels?.includes("consumer");

export function capacity(requested = "auto") {
  const cpus = availableParallelism();
  const jobs =
    requested === "auto"
      ? Math.max(1, Math.min(6, cpus - 1, Math.floor(totalmem() / (6 * GiB))))
      : Number(requested);
  if (!Number.isSafeInteger(jobs) || jobs < 1)
    throw new Error("--jobs must be auto or a positive integer");
  return {
    jobs,
    nativeJobs:
      requested === "auto"
        ? Math.max(1, Math.min(jobs, Math.floor(totalmem() / (12 * GiB))))
        : jobs,
    cpu: Math.max(1, cpus - 2),
    memoryGiB: Math.max(4, (totalmem() / GiB) * 0.6),
    cloning: Math.min(2, jobs),
  };
}

// Ports are the unchanged scenario defaults, including their existing overrides.
export function demand(job, env = process.env) {
  const keys = [`owner:${job.owner}`];
  let ports = [],
    preflightPorts = [],
    postgres,
    pooled = false;
  const localHost = (host) =>
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host.toLowerCase());
  const consumed = (value) => {
    const url = new URL(value);
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    keys.push(
      localHost(url.hostname)
        ? `tcp:${port}`
        : `endpoint:${url.hostname}:${port}`,
    );
  };
  switch (job.owner) {
    case "test/vetra-e2e":
      ports = [3001, 4002, 4173, 5555, 4012, 4013, 8080, 8081];
      break;
    case "packages/workflow":
      if (job.runner === "playwright")
        ports = [
          Number(env.UI_SHOTS_SWITCHBOARD_PORT ?? 4001),
          Number(env.UI_SHOTS_CONNECT_PORT ?? 3100),
        ];
      break;
    case "test/test-fusion":
      ports = [4001, 3110, 3111];
      break;
    case "test/test-connect":
      if (job.runner === "custom")
        ports = [Number(env.PH_LOAD_TEST_PORT ?? 4001)];
      break;
    case "test/switchboard":
      if (env.SWITCHBOARD_URL) consumed(env.SWITCHBOARD_URL);
      else ports.push(Number(env.SWITCHBOARD_PORT ?? 4001));
      if (job.files.some((file) => file.endsWith("/renown-self-auth.test.ts")))
        ports.push(4022, 4023);
      if (job.files.some((file) => file.endsWith("/router.test.ts")))
        ports.push(Number(env.SWITCHBOARD_ROUTER_PORT ?? 4024));
      break;
    case "test/package-e2e":
      ports = [8080, 3001, 4001, Number(env.STUDIO_PORT ?? 3311)];
      preflightPorts = [8080];
      keys.push("docker");
      break;
    case "test/workflow-piece-e2e": {
      const port = Number(env.PH_WORKFLOW_E2E_PORT ?? 4021);
      ports = [8080, port, port + 1, port + 2];
      preflightPorts = env.PH_WORKFLOW_E2E_REUSE_REGISTRY === "1" ? [] : [8080];
      break;
    }
    case "test/recipes-e2e":
      ports = [9123, 4001, 4199];
      keys.push("recipes-workdir");
      break;
    case "test/registry-e2e":
      ports = [4900, 4901, 4902, 4903, 4910, 4920];
      keys.push("docker");
      break;
  }
  if (job.owner === "apps/reactor-monitor")
    postgres = env.PH_MONITOR_TEST_PG_URL;
  else if (
    job.owner === "packages/reactor-api" &&
    job.scriptName === "test:integration"
  ) {
    pooled = true;
    postgres = {
      hostname:
        job.env.REACTOR_TEST_PG_HOST ?? env.REACTOR_TEST_PG_HOST ?? "localhost",
      port:
        (job.env.REACTOR_TEST_PG_PORT ?? env.REACTOR_TEST_PG_PORT)
          ? Number(job.env.REACTOR_TEST_PG_PORT ?? env.REACTOR_TEST_PG_PORT)
          : 5433,
    };
  } else if (
    /^(?:packages\/reactor(?:-|\/|$)|apps\/switchboard$|test\/test-client$)/.test(
      job.owner,
    )
  ) {
    pooled = true;
    postgres =
      job.env.REACTOR_TEST_PG_URL ??
      env.REACTOR_TEST_PG_URL ??
      "postgres://localhost:5433/reactor";
  } else if (/packages\/analytics-engine\/(?:pg|compat)$/.test(job.owner))
    postgres =
      job.env.PG_CONNECTION_STRING ??
      "postgresql://postgres:password@localhost:5555/analytics";
  else if (job.owner === "packages/analytics-engine/knex")
    postgres = job.env.PG_CONNECTION_STRING ?? env.PG_CONNECTION_STRING;
  else if (job.owner === "packages/registry")
    postgres = env.REGISTRY_TEST_PG_URL;
  const postgresKey = (value) => {
    const url = typeof value === "string" ? new URL(value) : value;
    return `postgres:${localHost(url.hostname) ? "127.0.0.1" : url.hostname.toLowerCase()}:${url.port || 5432}`;
  };
  const pool =
    pooled && job.postgresPool?.length > 1
      ? job.postgresPool.map((url) => ({ key: postgresKey(url), url }))
      : undefined;
  if (postgres && !pool) keys.push(postgresKey(postgres));
  keys.push(...ports.map((port) => `tcp:${port}`));
  const native = ["vitest", "node"].includes(job.runner);
  return {
    keys: [...new Set(keys)],
    ...(pool ? { pool } : {}),
    ports,
    preflightPorts,
    cpu: native ? Math.max(1, Math.min(4, job.files.length)) : 4,
    memoryGiB: native ? (job.files.length > 8 ? 6 : 3) : 6,
    // Longest first: CI's measured seconds per package when known, otherwise the file count.
    priority: (native ? 0 : 10000) + (job.weight ?? job.files.length),
  };
}

export async function schedule(
  jobs,
  limits,
  {
    execute,
    settled,
    signal,
    createWorkspace,
    disposeWorkspace,
    referenceRoot,
    admissionIssue = () => undefined,
  },
) {
  const serviceKeys = (job) =>
    job.resources.keys.filter((key) => !key.startsWith("owner:"));
  const frequency = new Map();
  for (const job of jobs)
    for (const key of serviceKeys(job))
      frequency.set(key, (frequency.get(key) ?? 0) + 1);
  const pressure = (job) =>
    Math.max(0, ...serviceKeys(job).map((key) => frequency.get(key)));
  const pending = [...jobs].sort(
    (a, b) =>
      pressure(b) - pressure(a) ||
      b.resources.priority - a.resources.priority ||
      a.index - b.index,
  );
  // With spare residents, one checkout per service may copy behind its native user.
  const copyAhead = limits.jobs > (limits.nativeJobs ?? limits.jobs);
  const active = new Set(),
    closing = new Set(),
    workspaces = [],
    owners = new Set(),
    keys = new Set(),
    poisoned = new Set();
  let cpu = 0,
    memory = 0,
    cloning = 0,
    order = 0;
  const resize = (state, nextCpu, nextMemory) => {
    cpu += nextCpu - state.cpu;
    memory += nextMemory - state.memory;
    state.cpu = nextCpu;
    state.memory = nextMemory;
  };
  const retire = (workspace) => {
    workspace.state = "closing";
    const state = { cpu: 0, memory: 0 };
    resize(state, 1, 0.5);
    closing.add(state);
    state.task = (async () => {
      try {
        workspace.closure = await disposeWorkspace(workspace);
      } catch (error) {
        workspace.closure = { deleted: false, error: String(error) };
      } finally {
        workspace.state = workspace.closure.deleted ? "deleted" : "retained";
        resize(state, 0, 0);
        closing.delete(state);
      }
    })();
  };
  const release = (state, cleanup) => {
    if (state.phase !== "native") return;
    if (state.member) {
      keys.delete(state.member.key);
      if (cleanup?.valid !== true) poisoned.add(state.member.key);
    }
    for (const key of serviceKeys(state.job)) {
      keys.delete(key);
      if (cleanup?.valid !== true) poisoned.add(key);
    }
    if (cleanup?.valid !== true) poisoned.add(`owner:${state.job.owner}`);
    state.job.lease.releasedAt = new Date().toISOString();
    state.job.lease.cleanupValid = cleanup?.valid === true;
    state.phase = "private";
    resize(state, 1, state.job.resources.memoryGiB);
  };
  while (pending.length || active.size || closing.size) {
    let blocked;
    for (
      let i = 0;
      i < pending.length && active.size + closing.size < limits.jobs;
      i++
    ) {
      const job = pending[i],
        owner = `owner:${job.owner}`,
        services = serviceKeys(job);
      if (
        signal.aborted ||
        owners.has(owner) ||
        poisoned.has(owner) ||
        services.some((key) => poisoned.has(key))
      )
        continue;
      if (
        services.some((key) =>
          [...active].some(
            (state) =>
              state.phase !== "private" &&
              !(copyAhead && state.phase === "native") &&
              serviceKeys(state.job).includes(key),
          ),
        )
      )
        continue;
      if (
        active.size &&
        (cpu + 1 > limits.cpu || memory + 0.5 > limits.memoryGiB)
      )
        continue;
      const inPlace = runsInPlace(job);
      if (inPlace && poisoned.has(CHECKOUT)) continue;
      let workspace;
      if (!inPlace) {
        // Disk pressure only affects copies; in-place jobs keep running.
        const issue = admissionIssue();
        if (issue) {
          blocked = issue;
          continue;
        }
        if (cloning >= limits.cloning) continue;
        if (
          workspaces.filter((item) => item.state !== "deleted").length >=
          limits.jobs
        )
          continue;
        workspace = { ...createWorkspace(workspaces.length + 1), jobs: [] };
        workspace.state = "busy";
        workspace.jobs.push(job.id);
        workspaces.push(workspace);
      }
      const assignment = inPlace
        ? { id: 0, root: referenceRoot, reuse: true, inPlace: true }
        : { id: workspace.id, root: workspace.root, reuse: false };
      pending.splice(i--, 1);
      owners.add(owner);
      if (!assignment.reuse) cloning++;
      const state = {
        job,
        phase: "cloning",
        copying: !assignment.reuse,
        cpu: 0,
        memory: 0,
      };
      resize(state, 1, 0.5);
      const phases = {
        cloned() {
          if (state.phase !== "cloning") return;
          if (state.copying) cloning--;
          state.copying = false;
          state.phase = "ready";
          resize(state, 0, 0.5);
        },
        acquire() {
          if (state.phase !== "ready" || state.request)
            throw new Error("Native lease requested outside the ready phase");
          job.lease = { requestedAt: new Date().toISOString() };
          state.order = order++;
          return new Promise((resolve) => {
            state.request = resolve;
          });
        },
        release(cleanup) {
          release(state, cleanup);
        },
      };
      active.add(state);
      state.task = (async () => {
        let result;
        try {
          result = await execute(job, phases, assignment);
        } catch (error) {
          result = {
            ...job,
            gaps: [`Worker failed: ${error.stack ?? error}`],
            collection: { valid: false },
          };
        } finally {
          release(state, result?.cleanup);
          if (state.copying) cloning--;
          state.request?.(false);
          resize(state, 0, 0);
          owners.delete(owner);
        }
        result.lease = job.lease;
        // Nothing can restore the reference checkout, so later in-place jobs would measure changed inputs.
        if (assignment.inPlace && result.scenario?.inputValidAfter === false)
          poisoned.add(CHECKOUT);
        if (workspace) {
          if (result.scenario?.deleted) workspace.state = "deleted";
          else retire(workspace);
        }
        settled(result);
        active.delete(state);
      })();
    }
    for (const state of [...active]
      .filter((item) => item.request)
      .sort((a, b) => a.order - b.order)) {
      const services = serviceKeys(state.job),
        r = state.job.resources;
      if (
        signal.aborted ||
        services.some((key) => poisoned.has(key)) ||
        r.pool?.every((member) => poisoned.has(member.key))
      ) {
        state.request(false);
        state.request = undefined;
        continue;
      }
      if (services.some((key) => keys.has(key))) continue;
      const member = r.pool?.find(
        (item) => !keys.has(item.key) && !poisoned.has(item.key),
      );
      if (r.pool && !member) continue;
      if (
        [...active].filter((other) => other.phase === "native").length >=
        (limits.nativeJobs ?? limits.jobs)
      )
        continue;
      const fits =
        cpu - state.cpu + r.cpu <= limits.cpu &&
        memory - state.memory + r.memoryGiB <= limits.memoryGiB;
      if (
        !fits &&
        [...active, ...closing].some(
          (other) => other !== state && other.cpu > 0,
        )
      )
        continue;
      services.forEach((key) => keys.add(key));
      if (member) {
        keys.add(member.key);
        state.member = member;
        state.job.lease.pool = member.url;
      }
      state.phase = "native";
      resize(state, r.cpu, r.memoryGiB);
      state.job.lease.grantedAt = new Date().toISOString();
      state.request(true);
      state.request = undefined;
    }
    if (!active.size && !closing.size) {
      for (const job of pending.splice(0))
        settled({
          ...job,
          gaps: [
            signal.aborted
              ? "Coverage run interrupted before execution"
              : (blocked ??
                (runsInPlace(job) && poisoned.has(CHECKOUT)
                  ? "An in-place job changed the reference checkout; later in-place jobs did not run"
                  : "Shared resources remain blocked after failed cleanup")),
          ],
          collection: { valid: false },
        });
      break;
    }
    await Promise.race([
      ...[...active].map((state) => state.task),
      ...[...closing].map((state) => state.task),
      new Promise((done) => setTimeout(done, 100)),
    ]);
  }
  return workspaces;
}
