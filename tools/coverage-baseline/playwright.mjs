import { createServer } from "node:net";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test as base } from "@playwright/test";
export * from "@playwright/test";

const active = new WeakMap();
const PROTOCOL_TIMEOUT_MS = 10_000;

function within(promise, label, ms = PROTOCOL_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms} ms`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

// Coverage export must never fail or stall the test's own teardown; failures become gaps.
async function stopVia(controller, page, stopper) {
  try {
    const session = await within(
      page.context().newCDPSession(page),
      "CDP session",
    );
    try {
      const { targetInfo } = await within(
        session.send("Target.getTargetInfo"),
        "Target.getTargetInfo",
      );
      await stopper(targetInfo);
    } finally {
      await within(session.detach(), "CDP detach").catch(() => {});
    }
  } catch (error) {
    controller.note(`Coverage export before close failed: ${error.message}`);
  }
}

export async function closeContext(context) {
  const controller = active.get(context.browser());
  if (controller && context.pages().length)
    await stopVia(controller, context.pages()[0], (target) =>
      controller.stopContext(target.browserContextId),
    );
  await context.close();
}

export async function closePage(page) {
  const controller = active.get(page.context().browser());
  if (controller && !page.isClosed())
    await stopVia(controller, page, (target) =>
      controller.stopTarget(target.targetId),
    );
  await page.close();
}

export async function collectBrowser(browser, port, output, options = {}) {
  // Loaded on demand: ordinary runs, including CommonJS projects Playwright transpiles, never load these.
  const [{ default: CDP }, { CDPClient, CoverageReport }, config] =
    await Promise.all([
      import("chrome-remote-interface"),
      import("monocart-coverage-reports"),
      import("./config.mjs"),
    ]);
  const { monocartOptions, sourceFiles } = config;
  if (!browser) throw new Error("Coverage requires Chromium");
  const root = options.root ?? process.env.PH_COVERAGE_ROOT ?? process.cwd();
  const sources =
    options.sources ??
    (process.env.PH_COVERAGE_SOURCES
      ? JSON.parse(readFileSync(process.env.PH_COVERAGE_SOURCES, "utf8"))
      : sourceFiles(root));
  const id = `${process.pid}-${randomUUID()}`;
  const sessionOut = join(output, id);
  const mappingErrors = [];
  const report = new CoverageReport({
    ...monocartOptions(root, sessionOut, sources, mappingErrors),
    reports: [["raw", { outputDir: "raw" }]],
  });
  const version = await CDP.Version({ host: "127.0.0.1", port });
  const cdp = await CDP({
    host: "127.0.0.1",
    port,
    target: version.webSocketDebuggerUrl,
  });
  const clients = new Map();
  const errors = [];
  let scripts = 0;
  const filter = [
    "page",
    "iframe",
    "worker",
    "shared_worker",
    "service_worker",
  ].map((type) => ({ type }));
  cdp.on(
    "Target.attachedToTarget",
    ({ sessionId, targetInfo, waitingForDebugger }, parentSession) => {
      if (clients.has(targetInfo.targetId)) return;
      const parent = [...clients.values()].find(
        (entry) => entry.sessionId === parentSession,
      );
      const entry = {
        sessionId,
        parentSession,
        waitingForDebugger,
        collecting: false,
        info: {
          ...targetInfo,
          browserContextId:
            targetInfo.browserContextId ?? parent?.info.browserContextId,
        },
        stopped: false,
      };
      clients.set(targetInfo.targetId, entry);
      // Functions compiled before profiling lack block ranges, so this target's hits would inflate.
      entry.late =
        !waitingForDebugger &&
        Boolean(targetInfo.url) &&
        targetInfo.url !== "about:blank";
      if (entry.late)
        errors.push(
          `Target was already running before collection: ${targetInfo.type} ${targetInfo.url}`,
        );
      entry.ready = (async () => {
        try {
          entry.client = await CDPClient({
            session: {
              send: (method, params) =>
                method === "Debugger.resume" && !entry.collecting
                  ? Promise.resolve({})
                  : cdp.send(method, params, sessionId),
              on: (method, handler) =>
                cdp.on(`${method}.${sessionId}`, handler),
              off: (method, handler) =>
                cdp.off(`${method}.${sessionId}`, handler),
              detach: () => cdp.send("Target.detachFromTarget", { sessionId }),
            },
          });
          if (!entry.client)
            throw new Error(`No collector for ${targetInfo.type}`);
          await entry.client.startJSCoverage();
          entry.collecting = true;
          options.onTargetReady?.(entry.info);
          if (targetInfo.type === "page" || targetInfo.type === "iframe")
            await cdp.send(
              "Target.setAutoAttach",
              {
                autoAttach: true,
                waitForDebuggerOnStart: true,
                flatten: true,
                filter,
              },
              sessionId,
            );
        } catch (error) {
          errors.push(`${targetInfo.type}: ${error}`);
        } finally {
          await cdp
            .send("Runtime.runIfWaitingForDebugger", {}, sessionId)
            .catch((error) => errors.push(String(error)));
        }
      })();
    },
  );
  cdp.on("Target.detachedFromTarget", ({ sessionId }) => {
    const entry = [...clients.values()].find(
      (value) => value.sessionId === sessionId,
    );
    if (
      entry &&
      !entry.stopped &&
      entry.info.url &&
      entry.info.url !== "about:blank"
    )
      errors.push(
        `Target closed before collection: ${entry.info.type} ${entry.info.url}`,
      );
  });
  const stop = async (entry) => {
    if (entry.stopped) return;
    entry.stopped = true;
    try {
      await within(entry.ready, `${entry.info.type} attach`);
    } catch (error) {
      errors.push(`${entry.info.type}: ${error.message}`);
      return;
    }
    if (!entry.client) return;
    try {
      const data = await within(
        entry.client.stopJSCoverage(),
        `${entry.info.type} coverage export`,
      );
      if (!Array.isArray(data))
        throw new Error("Collector returned no coverage");
      entry.scripts = data.length;
      if (
        !data.length &&
        ["worker", "shared_worker", "service_worker"].includes(entry.info.type)
      )
        errors.push(
          `Worker returned no scripts: ${entry.info.type} ${entry.info.url}`,
        );
      if (data.some((item) => item.url && !item.source))
        errors.push(
          `Script source missing in ${entry.info.type}; its coverage was not added`,
        );
      else if (entry.late)
        errors.push(
          `Coverage of ${entry.info.type} ${entry.info.url} was not added: it started before profiling`,
        );
      else {
        // A script compiled after profiling started has a range over its whole source. Without one,
        // the script ran before the profiler was armed and its unlisted code would count as covered.
        const profiled = data.filter(
          (item) =>
            !item.url ||
            item.functions?.some(
              (fn) =>
                fn.ranges?.[0]?.startOffset === 0 &&
                fn.ranges[0].endOffset >= (item.source?.length ?? Infinity),
            ),
        );
        if (profiled.length < data.length)
          errors.push(
            `Coverage of ${data.length - profiled.length} ${entry.info.type} script(s) was not added: compiled before profiling (${data
              .filter((item) => !profiled.includes(item))
              .map((item) => item.url)
              .join(", ")})`,
          );
        if (profiled.length) {
          scripts += profiled.length;
          await report.add(profiled);
        }
      }
    } catch (error) {
      errors.push(`${entry.info.type}: ${error.message ?? error}`);
    } finally {
      await within(
        entry.client.close(),
        `${entry.info.type} collector close`,
      ).catch((error) => errors.push(error.message));
    }
  };
  active.set(browser, {
    note: (error) => errors.push(error),
    stopTarget: async (targetId) => {
      const target = clients.get(targetId);
      if (!target) return;
      for (const entry of clients.values())
        if (entry.parentSession === target.sessionId) await stop(entry);
      await stop(target);
    },
    stopContext: async (contextId) => {
      for (const entry of [...clients.values()].sort(
        (a, b) =>
          Number(a.info.type === "page") - Number(b.info.type === "page"),
      ))
        if (entry.info.browserContextId === contextId) await stop(entry);
    },
  });
  await cdp.send("Target.setAutoAttach", {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
    filter,
  });
  return async () => {
    try {
      for (const entry of [...clients.values()].sort(
        (a, b) =>
          Number(a.info.type === "page") - Number(b.info.type === "page"),
      ))
        await stop(entry);
      if (scripts) await report.generate();
    } catch (error) {
      errors.push(String(error));
    } finally {
      active.delete(browser);
      await within(cdp.close(), "CDP close").catch((error) =>
        errors.push(error.message),
      );
    }
    mkdirSync(output, { recursive: true });
    writeFileSync(
      join(output, `${id}.json`),
      JSON.stringify({
        testIds: [...(options.testIds ?? [])],
        mappingErrors,
        rawDir: join(sessionOut, "raw"),
        kinds: [...clients.values()].map((entry) => entry.info.type),
        targets: [...clients.values()].map((entry) => ({
          ...entry.info,
          waitingForDebugger: entry.waitingForDebugger,
          scripts: entry.scripts,
        })),
        errors,
      }),
    );
  };
}

const covered = base.extend({
  coveragePort: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") return use(undefined);
      const server = createServer();
      await new Promise((done, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", done);
      });
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("No browser coverage port");
      await new Promise((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
      await use(address.port);
    },
    { scope: "worker" },
  ],
  launchOptions: [
    async ({ launchOptions, coveragePort }, use) => {
      await use({
        ...launchOptions,
        args: [
          ...(launchOptions.args ?? []),
          ...(coveragePort ? [`--remote-debugging-port=${coveragePort}`] : []),
        ],
      });
    },
    { scope: "worker" },
  ],
  nativeBrowserCoverage: [
    async ({ browser, browserName, coveragePort }, use) => {
      if (browserName !== "chromium") return use(undefined);
      const testIds = new Set();
      const finish = await collectBrowser(
        browser,
        coveragePort,
        process.env.PH_COVERAGE_BROWSER_DIR,
        { testIds },
      );
      try {
        await use(testIds);
      } finally {
        await finish();
      }
    },
    { scope: "worker", auto: true },
  ],
  context: async ({ context }, use) => {
    try {
      await use(context);
    } finally {
      await closeContext(context);
    }
  },
  nativeCoverage: [
    async ({ nativeBrowserCoverage }, use, testInfo) => {
      nativeBrowserCoverage?.add(testInfo.testId);
      await use();
    },
    { auto: true },
  ],
});
export const test = process.env.PH_COVERAGE_BROWSER_DIR ? covered : base;
