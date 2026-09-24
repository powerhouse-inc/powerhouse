// Props are validated in the worker before run() or a trigger hook: a
// required prop that is missing or mistyped fails the step, naming the field.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PieceWorker,
  PieceWorkerError,
} from "../../../src/pieces/activepieces/worker/host.js";

// Plain objects in the shape Property.* builds. run() and every hook echo
// what they were handed, so a test sees exactly what piece code would.
const FIXTURE = `
const props = {
  title: { displayName: "Title", type: "SHORT_TEXT", required: true },
  ocr: { displayName: "OCR", type: "CHECKBOX", required: true, defaultValue: true },
  format: {
    displayName: "Format",
    type: "STATIC_DROPDOWN",
    required: true,
    defaultValue: "markdown",
    options: { options: [{ label: "Markdown", value: "markdown" }] },
  },
  limit: { displayName: "Limit", type: "NUMBER", required: false },
  note: { displayName: "Note", type: "SHORT_TEXT", required: false },
  payload: { displayName: "Payload", type: "JSON", required: false },
  rows: {
    displayName: "Rows",
    type: "ARRAY",
    required: false,
    properties: {
      name: { displayName: "Name", type: "SHORT_TEXT", required: true },
      kind: { displayName: "Kind", type: "SHORT_TEXT", required: true, defaultValue: "static" },
    },
  },
};
globalThis.__ran = 0;
const app = {
  displayName: "Validation Fixture",
  actions: {
    echo: {
      name: "echo",
      displayName: "Echo",
      props,
      run: async (ctx) => ({ propsValue: ctx.propsValue }),
    },
  },
  triggers: {
    poll: {
      name: "poll",
      displayName: "Poll",
      type: "POLLING",
      props: { title: props.title },
      onEnable: async () => undefined,
      onDisable: async (ctx) => { await ctx.store.put("disabled", ctx.propsValue); },
      run: async (ctx) => [ctx.propsValue],
    },
  },
};
module.exports = { app };
`;

let dir = "";
let worker: PieceWorker;

async function runEcho(propsValue: Record<string, unknown>) {
  const result = await worker.runAction({
    bundleDir: dir,
    actionName: "echo",
    propsValue,
  });
  return (result.output as { propsValue: Record<string, unknown> }).propsValue;
}

async function failure(promise: Promise<unknown>): Promise<PieceWorkerError> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(PieceWorkerError);
  return error as PieceWorkerError;
}

describe("props validation in the worker", () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ap-props-validation-"));
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "validation",
        version: "1.0.0",
        main: "index.js",
      }),
    );
    await writeFile(join(dir, "index.js"), FIXTURE);
    worker = new PieceWorker();
  });

  afterAll(async () => {
    worker.dispose();
    await rm(dir, { recursive: true, force: true });
  });

  it("refuses a missing required prop before run(), naming it", async () => {
    const error = await failure(runEcho({}));
    expect(error.message).toBe(
      'PropsValidationError: Invalid input for action "echo": ' +
        "Title (title): Expected string, received: undefined",
    );
    expect(error.serialized.invalidProps).toEqual({
      title: ["Expected string, received: undefined"],
    });
  });

  it("names every field that fails, nested ARRAY rows included", async () => {
    const error = await failure(
      runEcho({
        limit: "many",
        payload: "",
        rows: [{ name: "a" }, { kind: "x" }],
      }),
    );
    expect(error.serialized.invalidProps).toEqual({
      title: ["Expected string, received: undefined"],
      limit: ["Expected number, received: many"],
      rows: {
        properties: [{}, { name: ["Expected string, received: undefined"] }],
      },
    });
    expect(error.message).toContain("Limit (limit): Expected number");
    expect(error.message).toContain(
      "rows[1].name: Expected string, received: undefined",
    );
  });

  it("fills an unset prop from its defaultValue, as the editor shows it", async () => {
    const props = await runEcho({ title: "t", rows: [{ name: "a" }] });
    expect(props).toEqual({
      title: "t",
      ocr: true,
      format: "markdown",
      rows: [{ name: "a", kind: "static" }],
    });
  });

  it("keeps optional props that are empty or unset", async () => {
    const props = await runEcho({
      title: "t",
      limit: "",
      note: "",
      payload: "",
      ocr: false,
    });
    expect(props).toEqual({ title: "t", ocr: false, format: "markdown" });
  });

  it("keeps a JSON prop's unparseable text for the piece to parse", async () => {
    const props = await runEcho({ title: "t", payload: 'Sure: {"a":1}' });
    expect(props.payload).toBe('Sure: {"a":1}');
  });

  it("validates a trigger's props before its hooks", async () => {
    const error = await failure(
      worker.runTriggerHook({
        bundleDir: dir,
        triggerName: "poll",
        hook: "run",
        propsValue: {},
      }),
    );
    expect(error.message).toContain(
      'Invalid input for trigger "poll": Title (title)',
    );
    expect(error.serialized.invalidProps).toBeDefined();
  });

  it("still runs onDisable when the props no longer validate", async () => {
    const result = await worker.runTriggerHook({
      bundleDir: dir,
      triggerName: "poll",
      hook: "onDisable",
      propsValue: {},
      storeState: {},
    });
    expect(result.storeState).toEqual({ "flow_flow/disabled": {} });
  });
});
