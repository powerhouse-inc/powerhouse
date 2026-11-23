import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readRunRecord } from "@powerhousedao/host-core";
import type { IAttachmentService } from "@powerhousedao/reactor-attachments";
import { packageJsonExports } from "@powerhousedao/shared/clis/constants";
import type * as SwitchboardServer from "@powerhousedao/switchboard/server";
import { documentModelDocumentModelModule, type ILogger } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryWorkdirStore } from "../src/core/store.js";
import type { CommandContext } from "../src/core/types.js";
import { createAttachmentCommands } from "../src/integrations/powerhouse/attachment-commands.js";
import { createFolderOperations } from "../src/integrations/powerhouse/folders.js";
import { attachDefaultReactor } from "../src/integrations/powerhouse/index.js";

// The Cli runner end to end: a real switchboard in this process, and the real
// `ph-run run <host>` in a child per case, with real stdio, against a project
// whose hosts name the built runner and the fixture Clis.

const here = path.dirname(fileURLToPath(import.meta.url));
const CLINT_ROOT = path.resolve(here, "..");
const FIXTURES = path.join(here, "fixtures", "cli-runner");
const PH_RUN = path.resolve(CLINT_ROOT, "../../clis/ph-run/dist/cli.mjs");
const RUNNER = path.join(CLINT_ROOT, "dist", "runners", "cli-runner.mjs");
const DRIVE_TYPE = "powerhouse/document-drive";
// A package whose model references an attachment (`setAttachment`), which the
// switchboard loads by path.
const ATTACHMENT_NOTE = path.join(here, "fixtures", "attachment-note");
const NOTE_TYPE = "clint-test/attachment-note";
// clint-common's chat-session model, from its build, loaded the same way.
const CHAT_SESSION = path.join(here, "fixtures", "chat-session");
const CHAT_SESSION_BUILD = path.resolve(
  CLINT_ROOT,
  "../clint-common/dist/node/document-models/index.mjs",
);
const CHAT_TYPE = "powerhouse/chat-session";
// clint-common's chat reader. clint cannot depend on the package that depends
// on it, so the reader's source is loaded by path.
const EXTRACT_ATTACHMENTS = path.resolve(
  CLINT_ROOT,
  "../clint-common/chat/extract-attachments.ts",
);
type ExtractAttachments = (
  message: object,
  options: {
    workdir: string;
    documentId: string;
    service?: IAttachmentService;
  },
) => Promise<Array<{ localPath: string; mediaType: string | null }>>;

function quietLogger(): ILogger {
  const noop = () => undefined;
  const logger = {
    level: "error",
    verbose: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    errorHandler: noop,
    child: () => logger,
  };
  return logger as unknown as ILogger;
}

const stripAnsi = (text: string) =>
  text
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b\[[0-9;?<>=]*[A-Za-z~]/g, "")
    .replace(/\x1b[=>78]/g, "");

function link(target: string, at: string) {
  mkdirSync(path.dirname(at), { recursive: true });
  symlinkSync(target, at, process.platform === "win32" ? "junction" : "dir");
}

/** A fixture Cli as a module: its file and the commands it imports. */
function writeCli(dir: string, file: string, fixture: string) {
  mkdirSync(dir, { recursive: true });
  copyFileSync(path.join(FIXTURES, fixture), path.join(dir, file));
  copyFileSync(
    path.join(FIXTURES, "commands.mjs"),
    path.join(dir, "commands.mjs"),
  );
}

function hostFile(name: string, url: string, config?: object): string {
  const host = {
    name,
    runner: { module: "@powerhousedao/clint/cli-runner" },
    ...(config ? { config } : {}),
    reactor: {
      backends: { switchboard: { kind: "remote", remote: { url } } },
    },
  };
  return `export default ${JSON.stringify(host, null, 2)};\n`;
}

/**
 * The project: its own `./cli` (the plain fixture, reached by self-reference)
 * and two fixture packages; clint and zod linked the way pnpm would.
 */
function makeProject(url: string): string {
  const root = mkdtempSync(path.join(tmpdir(), "ph-cli-runner-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "cli-lab",
      private: true,
      type: "module",
      exports: { "./cli": packageJsonExports["./cli"] },
    }),
  );
  writeCli(
    path.join(root, path.dirname(packageJsonExports["./cli"].node)),
    path.basename(packageJsonExports["./cli"].node),
    "plain-cli.mjs",
  );
  const modules = path.join(root, "node_modules");
  link(CLINT_ROOT, path.join(modules, "@powerhousedao", "clint"));
  link(
    realpathSync(path.join(CLINT_ROOT, "node_modules", "zod")),
    path.join(modules, "zod"),
  );
  for (const [name, fixture] of [
    ["embedded-cli", "embedded-cli.mjs"],
    ["serving-cli", "serving-cli.mjs"],
    ["function-remote-cli", "function-remote-cli.mjs"],
  ] as const) {
    const dir = path.join(modules, "@fixture", name);
    writeCli(dir, "cli.mjs", fixture);
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: `@fixture/${name}`,
        type: "module",
        exports: { "./cli": { node: "./cli.mjs" } },
      }),
    );
  }
  const hosts: [string, object | undefined][] = [
    ["cli", undefined],
    ["embedded", { package: "@fixture/embedded-cli" }],
    ["serving", { package: "@fixture/serving-cli" }],
    ["function-remote", { package: "@fixture/function-remote-cli" }],
  ];
  for (const [name, config] of hosts) {
    mkdirSync(path.join(root, "hosts", name), { recursive: true });
    writeFileSync(
      path.join(root, "hosts", name, "host.js"),
      hostFile(name, url, config),
    );
  }
  // A package that supplies a host of the same name over its own `./cli`
  // (no config.package: the package's own, not the project's).
  const pack = path.join(modules, "@fixture", "tool-pack");
  writeCli(pack, "cli.mjs", "serving-cli.mjs");
  writeFileSync(
    path.join(pack, "package.json"),
    JSON.stringify({
      name: "@fixture/tool-pack",
      type: "module",
      exports: { "./cli": { node: "./cli.mjs" } },
    }),
  );
  mkdirSync(path.join(pack, "hosts", "serving"), { recursive: true });
  writeFileSync(
    path.join(pack, "hosts", "serving", "host.js"),
    hostFile("serving", url),
  );
  return root;
}

interface Run {
  child: ChildProcess;
  /** stdout and stderr so far, without terminal escapes. */
  output(): string;
  exited: Promise<number | null>;
}

const started: ChildProcess[] = [];

function killTree(pid: number) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
    });
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
}

describe("cli-runner", () => {
  let switchboard: SwitchboardServer.SwitchboardReactor;
  let root: string;
  let project: string;
  let url: string;
  let labId: string;
  let documentId: string;
  const env: Record<string, string> = {};

  function phRun(
    args: string[],
    options: { env?: Record<string, string>; preload?: string } = {},
  ): Run {
    const child = spawn(
      process.execPath,
      [
        ...(options.preload
          ? ["--import", pathToFileURL(options.preload).href]
          : []),
        PH_RUN,
        "run",
        ...args,
      ],
      {
        cwd: project,
        env: { ...env, ...options.env },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    started.push(child);
    let text = "";
    child.stdout?.on("data", (chunk: Buffer) => (text += chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => (text += chunk.toString()));
    // A child that is gone takes its pipe with it.
    child.stdin?.on("error", () => undefined);
    const exited = new Promise<number | null>((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );
    return { child, output: () => stripAnsi(text), exited };
  }

  async function waitFor(run: Run, expected: string, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    while (!run.output().includes(expected)) {
      if (run.child.exitCode !== null) {
        throw new Error(
          `exited (${run.child.exitCode}) before printing "${expected}":\n${run.output()}`,
        );
      }
      if (Date.now() > deadline) {
        throw new Error(
          `"${expected}" not printed within ${timeoutMs} ms:\n${run.output()}`,
        );
      }
      await sleep(100);
    }
  }

  async function exitCodeOf(run: Run, timeoutMs = 60_000) {
    const timeout = sleep(timeoutMs).then(() => {
      throw new Error(`still running after ${timeoutMs} ms:\n${run.output()}`);
    });
    return Promise.race([run.exited, timeout]);
  }

  beforeAll(async () => {
    for (const [file, what] of [
      [RUNNER, "@powerhousedao/clint"],
      [PH_RUN, "@powerhousedao/ph-run"],
      [CHAT_SESSION_BUILD, "@powerhousedao/clint-common"],
    ]) {
      if (!existsSync(file)) {
        throw new Error(`Build ${what} first: ${file} is missing.`);
      }
    }
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value;
    }
    // Ink renders only its last frame in CI; the shell test reads frames.
    env.CI = "false";
    delete env.PH_STOP_ON_STDIN;

    root = mkdtempSync(path.join(tmpdir(), "ph-cli-runner-sb-"));
    const { startSwitchboard } =
      await import("@powerhousedao/switchboard/server");
    switchboard = await startSwitchboard(
      {
        server: { port: 0, host: "127.0.0.1" },
        storage: { inMemory: true, userDataDir: path.join(root, "user") },
        features: { workflows: false, mcp: false },
        packages: { disableLocal: true, list: [ATTACHMENT_NOTE, CHAT_SESSION] },
        identity: { keypairPath: path.join(root, "identity.json") },
        drive: { slug: "lab", global: { name: "Lab" } },
      },
      {
        logger: quietLogger(),
        signalHandlers: false,
        fatalErrorShutdown: false,
      },
    );
    url = `http://127.0.0.1:${switchboard.port}/d/lab`;
    const drives = await switchboard.reactor.find({ type: DRIVE_TYPE });
    const lab = drives.results.find((drive) => drive.header.slug === "lab");
    if (!lab) throw new Error("the switchboard made no drive lab");
    labId = lab.header.id;
    documentId = (
      await switchboard.reactor.createEmpty("powerhouse/document-model")
    ).header.id;
    project = makeProject(url);
  }, 180_000);

  afterAll(async () => {
    const survivors = started.filter(
      (child) => child.exitCode === null && child.signalCode === null,
    );
    for (const child of survivors) if (child.pid) killTree(child.pid);
    await switchboard?.shutdown();
    if (project) {
      rmSync(project, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 300,
      });
    }
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 10 });
    expect(survivors.map((child) => child.pid)).toEqual([]);
  }, 60_000);

  it("runs a one-shot command, prints and exits with the command's code", async () => {
    const hello = phRun(["cli", "--", "hello", "--name", "Ada"]);
    expect(await exitCodeOf(hello)).toBe(0);
    expect(hello.output()).toContain("Hello, Ada!");

    // `run` spelled out: what follows the verb is the Cli's too.
    const failing = phRun(["cli", "run", "fail"]);
    expect(await exitCodeOf(failing)).toBe(1);
    expect(failing.output()).toContain("intentional failure");

    // A one-shot leaves no run record behind.
    expect(readRunRecord(project, "cli")).toBeUndefined();
  }, 120_000);

  it("reads a document through the remote switchboard, on the drive the address names", async () => {
    const read = phRun(["cli", "--", "read-doc", documentId]);
    expect(await exitCodeOf(read)).toBe(0);
    expect(read.output()).toContain(
      `read ${documentId} powerhouse/document-model (drive ${labId})`,
    );
  }, 120_000);

  it("answers over stdin in the streaming mode, and records the run while it is open", async () => {
    const shell = phRun(["cli", "--", "-i"]);
    await waitFor(shell, `Reactor ready (drive: ${labId})`);
    expect(shell.output()).toContain("fixture-cli shell");
    expect(readRunRecord(project, "cli")?.pid).toBe(shell.child.pid);

    shell.child.stdin?.write("/hello --name Bo\n");
    await waitFor(shell, "Hello, Bo!");
    shell.child.stdin?.write(`/read-doc ${documentId}\n`);
    await waitFor(shell, `read ${documentId} powerhouse/document-model`);
    shell.child.stdin?.write("/exit\n");

    expect(await exitCodeOf(shell)).toBe(0);
    expect(readRunRecord(project, "cli")).toBeUndefined();
  }, 120_000);

  it("opens the ink shell when stdin is a terminal", async () => {
    // No pseudo-terminal on Windows: the child marks its piped stdin as one.
    const shell = phRun(["cli", "--", "-i"], {
      preload: path.join(FIXTURES, "fake-tty.mjs"),
    });
    await waitFor(shell, "fixture-cli shell");
    await waitFor(shell, `Reactor ready (drive: ${labId})`);
    // Ctrl+C, as the shell reads it in raw mode.
    shell.child.stdin?.write("\x03");

    expect(await exitCodeOf(shell)).toBe(0);
    expect(readRunRecord(project, "cli")).toBeUndefined();
  }, 120_000);

  it("never calls the create the Cli configured, and ensures its drive on the remote", async () => {
    const shell = phRun(["embedded", "--", "-i"]);
    await waitFor(shell, "Reactor ready (drive: ");
    const drives = await switchboard.reactor.find({ type: DRIVE_TYPE });
    const notes = drives.results.find((drive) => drive.header.name === "Notes");
    expect(notes).toBeDefined();
    expect(shell.output()).toContain(
      `Reactor ready (drive: ${notes?.header.id})`,
    );
    shell.child.stdin?.write(`/read-doc ${documentId}\n`);
    await waitFor(shell, `read ${documentId} powerhouse/document-model`);
    shell.child.stdin?.write("/exit\n");
    expect(await exitCodeOf(shell)).toBe(0);

    expect(shell.output()).not.toContain("embedded reactor created");
  }, 120_000);

  it("builds a remote config given as a function from the setup context", async () => {
    const read = phRun(["function-remote", "--", "read-doc", documentId]);
    expect(await exitCodeOf(read)).toBe(0);
    const drives = await switchboard.reactor.find({ type: DRIVE_TYPE });
    const desk = drives.results.find(
      (drive) => drive.header.name === `Desk ${path.basename(project)}`,
    );
    expect(desk).toBeDefined();
    expect(read.output()).toContain(
      `read ${documentId} powerhouse/document-model (drive ${desk?.header.id})`,
    );
  }, 120_000);

  it("keeps one serving instance, which `--stop` ends, and runs one-shots beside it", async () => {
    const serving = phRun(["serving"]);
    await waitFor(serving, "Serving");
    expect(readRunRecord(project, "serving")?.pid).toBe(serving.child.pid);

    const beside = phRun(["serving", "--", "hello", "--name", "Ada"]);
    expect(await exitCodeOf(beside)).toBe(0);
    expect(beside.output()).toContain("Hello, Ada!");

    // A second start is the running instance: shown, and nothing starts.
    const second = phRun(["serving"]);
    expect(await exitCodeOf(second)).toBe(0);
    expect(second.output()).toContain(
      `serving is already running for this project (pid ${serving.child.pid},`,
    );
    expect(second.output()).toContain("Nothing was started.");
    expect(second.output()).not.toContain("Serving");
    expect(readRunRecord(project, "serving")?.pid).toBe(serving.child.pid);

    const stop = phRun(["serving", "--stop"]);
    expect(await exitCodeOf(stop)).toBe(0);
    expect(stop.output()).toContain(
      `Stopped serving (pid ${serving.child.pid})`,
    );
    expect(await exitCodeOf(serving)).toBe(0);
    expect(readRunRecord(project, "serving")).toBeUndefined();
  }, 120_000);

  it("runs a package's cli host over the package's own Cli, recorded behind the package", async () => {
    // Without config.package the project's own (plain, one-shot) Cli would
    // end at once: serving shows the package's was loaded.
    const serving = phRun(["@fixture/tool-pack/serving"]);
    await waitFor(serving, "Serving");
    expect(readRunRecord(project, "@fixture/tool-pack/serving")).toMatchObject({
      host: "serving",
      package: "@fixture/tool-pack",
      pid: serving.child.pid,
    });
    expect(readRunRecord(project, "serving")).toBeUndefined();

    const second = phRun(["@fixture/tool-pack/serving"]);
    expect(await exitCodeOf(second)).toBe(0);
    expect(second.output()).toContain(
      `@fixture/tool-pack/serving is already running for this project (pid ${serving.child.pid},`,
    );

    const stop = phRun(["@fixture/tool-pack/serving", "--stop"]);
    expect(await exitCodeOf(stop)).toBe(0);
    expect(stop.output()).toContain(
      `Stopped @fixture/tool-pack/serving (pid ${serving.child.pid})`,
    );
    expect(await exitCodeOf(serving)).toBe(0);
    expect(
      readRunRecord(project, "@fixture/tool-pack/serving"),
    ).toBeUndefined();
  }, 120_000);

  describe("with PH_STOP_ON_STDIN set", () => {
    const supervised = { PH_STOP_ON_STDIN: "1" };

    it("refuses the shell, so stdin never becomes chat input", async () => {
      const shell = phRun(["cli", "--", "-i"], { env: supervised });
      expect(await exitCodeOf(shell)).toBe(1);
      expect(shell.output()).toContain("PH_STOP_ON_STDIN=1");
      expect(shell.output()).not.toContain("fixture-cli shell");
    }, 120_000);

    it("stops a serving Cli cleanly when stdin closes", async () => {
      const serving = phRun(["serving"], { env: supervised });
      await waitFor(serving, "Serving");
      serving.child.stdin?.end();

      expect(await exitCodeOf(serving, 30_000)).toBe(0);
      expect(readRunRecord(project, "serving")).toBeUndefined();
    }, 120_000);

    it("holds a stop asked while the Cli starts until it serves, well inside the limit", async () => {
      const serving = phRun(["serving"], { env: supervised });
      serving.child.stdin?.end();

      // The limit would end it with 143 after 15 s.
      expect(await exitCodeOf(serving, 12_000)).toBe(0);
      expect(serving.output()).toContain("Serving");
      expect(readRunRecord(project, "serving")).toBeUndefined();
    }, 120_000);

    it("takes a line on stdin as a stop request, not as a command", async () => {
      const serving = phRun(["serving"], { env: supervised });
      await waitFor(serving, "Serving");
      serving.child.stdin?.write("/hello --name Zed\n");

      expect(await exitCodeOf(serving, 30_000)).toBe(0);
      expect(serving.output()).not.toContain("Hello, Zed!");
      expect(readRunRecord(project, "serving")).toBeUndefined();
    }, 120_000);
  });

  describe("attachDefaultReactor", () => {
    const setup = () => ({
      workdir: root,
      config: {},
      workspace: createMemoryWorkdirStore(),
    });

    // The attachment commands with no `folders`: the context of a Cli that
    // does not serve. The attached reactor is what lets them reach the service.
    function attachmentCommands(
      reactor: Awaited<ReturnType<typeof attachDefaultReactor>>,
    ) {
      const context = {
        workdir: root,
        reactorAttached: true,
        reactor: () => Promise.resolve(reactor),
      } as unknown as CommandContext;
      return async (id: string, input: object) => {
        const command = createAttachmentCommands().find((c) => c.id === id)!;
        return (
          (await command.execute(input as never, context)) as {
            text: string;
          }
        ).text;
      };
    }

    it("attaches on the drive the address names, and releases once", async () => {
      const reactor = await attachDefaultReactor(setup(), { url });
      expect(reactor.driveId).toBe(labId);
      expect(reactor.driveUrl).toBe(url);
      expect(reactor.switchboardUrl).toBe(
        `http://127.0.0.1:${switchboard.port}/graphql`,
      );
      expect(reactor.writes?.ready()).toBe(true);
      const document = await reactor.client.get(documentId);
      expect(document.header.documentType).toBe("powerhouse/document-model");
      await reactor.shutdown();
      await reactor.shutdown();
    }, 60_000);

    it("finds or creates the drives the Cli asks for, through the client", async () => {
      const first = await attachDefaultReactor(setup(), {
        url,
        drives: [{ name: "Inbox", role: "personal" }],
      });
      const again = await attachDefaultReactor(setup(), {
        url,
        drive: { name: "Inbox" },
      });
      expect(first.personalDriveId).toBeTruthy();
      expect(first.driveId).toBe(first.personalDriveId);
      expect(again.driveId).toBe(first.driveId);
      expect(first.drives).toEqual([
        { id: first.driveId, name: "Inbox", role: "personal" },
      ]);
      await first.shutdown();
      await again.shutdown();
    }, 60_000);

    it("reads an attachment through the switchboard's service, by a document that references it", async () => {
      const reactor = await attachDefaultReactor(setup(), { url });
      expect(reactor.attachments).toBeDefined();
      const file = path.join(root, "note.txt");
      const content = `attached at ${Date.now()}`;
      writeFileSync(file, content);
      const run = attachmentCommands(reactor);

      const uploaded = await run("attachment-upload", { filePath: file });
      const ref = /^ref: (\S+)$/m.exec(uploaded)?.[1];
      expect(ref).toMatch(/^attachment:\/\/v1:[0-9a-f]{64}$/);
      expect(uploaded).toContain("status: available");

      // The switchboard indexes the ref from the operation that carries it.
      const noteId = (await switchboard.reactor.createEmpty(NOTE_TYPE)).header
        .id;
      await switchboard.reactor.execute(noteId, "main", [
        {
          id: randomUUID(),
          type: "SET_ATTACHMENT",
          scope: "global",
          input: { attachment: ref },
          timestampUtcMs: new Date().toISOString(),
        },
      ]);

      const stat = await run("attachment-stat", { ref, documentId: noteId });
      expect(stat).toContain("status: available");
      expect(stat).toContain("fileName: note.txt");
      expect(stat).toContain(`sizeBytes: ${content.length}`);

      const copy = path.join(root, "note-copy.txt");
      const got = await run("attachment-get", {
        ref,
        documentId: noteId,
        outPath: copy,
      });
      expect(got).toContain(`Wrote ${content.length} bytes to ${copy}`);
      expect(readFileSync(copy, "utf8")).toBe(content);

      // Without a document the read is refused, and the answer says why; a
      // document that does not reference the attachment serves nothing.
      for (const id of ["attachment-stat", "attachment-get"]) {
        expect(await run(id, { ref, outPath: copy })).toContain(
          "pass documentId",
        );
      }
      expect(await run("attachment-stat", { ref, documentId })).toContain(
        `Not found or error for ${ref}`,
      );

      // The chat reader reads through the document it is given.
      const { extractAttachments } = (await import(
        pathToFileURL(EXTRACT_ATTACHMENTS).href
      )) as { extractAttachments: ExtractAttachments };
      const extracted = await extractAttachments(
        {
          id: "msg-1",
          role: "USER",
          content: [
            {
              id: "part-file-1",
              type: "FILE",
              attachment: ref,
              filename: "note.txt",
              mediaType: "text/plain",
            },
          ],
        },
        { workdir: root, documentId: noteId, service: reactor.attachments },
      );
      expect(extracted).toHaveLength(1);
      expect(extracted[0].mediaType).toBe("text/plain");
      expect(readFileSync(extracted[0].localPath, "utf8")).toBe(content);
      await reactor.shutdown();

      // One-shot through the runner: the attach alone gives the command the
      // service.
      const oneShot = phRun([
        "cli",
        "--",
        "attachment-stat",
        "--ref",
        ref!,
        "--documentId",
        noteId,
      ]);
      expect(await exitCodeOf(oneShot)).toBe(0);
      expect(oneShot.output()).toContain("status: available");
    }, 120_000);

    it("reads an attachment sent in a chat message through the chat document, from the change event on", async () => {
      const reactor = await attachDefaultReactor(setup(), { url });
      const run = attachmentCommands(reactor);
      const workdir = mkdtempSync(path.join(root, "chat-"));
      const file = path.join(workdir, "chat.txt");
      const content = `sent in a chat at ${Date.now()}`;
      writeFileSync(file, content);
      const ref = /^ref: (\S+)$/m.exec(
        await run("attachment-upload", { filePath: file }),
      )?.[1];
      expect(ref).toMatch(/^attachment:\/\/v1:[0-9a-f]{64}$/);

      const { extractAttachments } = (await import(
        pathToFileURL(EXTRACT_ATTACHMENTS).href
      )) as { extractAttachments: ExtractAttachments };
      const chatId = (await switchboard.reactor.createEmpty(CHAT_TYPE)).header
        .id;
      type ChatMessage = { id: string; content: object[] };
      const messagesOf = (document: unknown) =>
        (document as { state: { global: { messages: ChatMessage[] } } }).state
          .global.messages;

      // The chat watch reads a message when the change event reaches the Cli,
      // and these are the events the switchboard's documentChanges feed
      // relays. A read started from the event, with no wait, is the watch's.
      const readOnChange = new Promise<Awaited<ReturnType<ExtractAttachments>>>(
        (resolve, reject) => {
          const unsubscribe = switchboard.reactor.subscribe({}, (event) => {
            const chat = event.documents?.find((d) => d.header.id === chatId);
            const message = chat && messagesOf(chat).find((m) => m.id === "u1");
            if (event.type !== "updated" || !message) return;
            unsubscribe();
            extractAttachments(message, {
              workdir,
              documentId: chatId,
              service: reactor.attachments,
            }).then(resolve, reject);
          });
        },
      );

      const sent = await switchboard.reactor.execute(chatId, "main", [
        {
          id: randomUUID(),
          type: "ADD_USER_MESSAGE",
          scope: "global",
          input: {
            id: "u1",
            content: [
              {
                id: "u1-file",
                type: "FILE",
                mediaType: "text/plain",
                attachment: ref,
                filename: "chat.txt",
              },
            ],
            createdAt: new Date().toISOString(),
          },
          timestampUtcMs: new Date().toISOString(),
        },
      ]);
      expect(messagesOf(sent)).toEqual([
        expect.objectContaining({
          content: [expect.objectContaining({ attachment: ref })],
        }),
      ]);

      // The switchboard indexed the ref from the chat operation: the event
      // came after it, and so does every read through the chat id.
      const extracted = await readOnChange;
      expect(extracted).toHaveLength(1);
      expect(extracted[0].mediaType).toBe("text/plain");
      expect(path.dirname(extracted[0].localPath)).toBe(
        path.join(workdir, "downloads"),
      );
      expect(readFileSync(extracted[0].localPath, "utf8")).toBe(content);

      const copy = path.join(workdir, "chat-copy.txt");
      expect(
        await run("attachment-get", { ref, documentId: chatId, outPath: copy }),
      ).toContain(`Wrote ${content.length} bytes to ${copy}`);
      expect(readFileSync(copy, "utf8")).toBe(content);
      await reactor.shutdown();
    }, 120_000);

    it("creates, links, names and unlinks documents in folders on the switchboard", async () => {
      // The light client heads a new document with the model it is given.
      const reactor = await attachDefaultReactor(setup(), {
        url,
        drive: { name: "Folders" },
        documentModels: [documentModelDocumentModelModule],
      });
      const driveId = reactor.personalDriveId!;
      const folders = createFolderOperations(reactor.client, driveId);
      const server = switchboard.reactor;
      const nodes = async () =>
        (
          (await server.get(driveId)) as unknown as {
            state: { global: { nodes: Array<Record<string, unknown>> } };
          }
        ).state.global.nodes;
      const children = async () =>
        (await server.getOutgoingRelationships(driveId, "child")).results.map(
          (child) => child.header.id,
        );

      const { documentId } = await folders.createDocument(
        "powerhouse/document-model",
        "specs/remote",
        "Spec A",
      );
      const folderId = await folders.ensureFolder("specs/remote");
      expect((await nodes()).filter((n) => n.id === documentId)).toEqual([
        expect.objectContaining({
          kind: "file",
          name: "Spec A",
          parentFolder: folderId,
        }),
      ]);
      expect(await children()).toContain(documentId);

      const linked = (await server.createEmpty("powerhouse/document-model"))
        .header.id;
      await folders.addDocument(linked, "specs/remote", "Spec B");
      expect((await server.get(linked)).header.name).toBe("Spec B");
      expect(await children()).toContain(linked);

      await folders.removeDocument(linked);
      expect((await nodes()).some((n) => n.id === linked)).toBe(false);
      expect(await children()).not.toContain(linked);
      await reactor.shutdown();
    }, 60_000);

    it("refuses an address whose drive the switchboard does not serve", async () => {
      await expect(
        attachDefaultReactor(setup(), {
          url: `http://127.0.0.1:${switchboard.port}/d/nowhere`,
        }),
      ).rejects.toThrow(/serves no drive "nowhere"/);
    }, 60_000);
  });
});
