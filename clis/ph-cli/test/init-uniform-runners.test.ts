import { afterEach, describe, expect, it, vi } from "vitest";

const createProject = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
vi.mock("@powerhousedao/codegen", () => ({ createProject }));

import {
  startInit,
  UNIFORM_RUNNERS_OPTION_WARNING,
} from "../src/services/init.js";
import type { InitArgs } from "../src/types.js";

function initArgs(extra: Partial<InitArgs>): InitArgs {
  return { namePositional: "demo", pnpm: true, ...extra } as InitArgs;
}

describe("ph init --uniform-runners", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    createProject.mockClear();
  });

  it("is accepted and warns once that it is no longer needed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    await startInit(initArgs({ uniformRunners: true }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(UNIFORM_RUNNERS_OPTION_WARNING);
    expect(createProject).toHaveBeenCalledTimes(1);
  });

  it("stays silent without the option", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    await startInit(initArgs({}));
    expect(warn).not.toHaveBeenCalled();
    expect(createProject).toHaveBeenCalledTimes(1);
  });
});
