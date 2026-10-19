import { describe, expect, it, vi } from "vitest";
import { fitCreateBaseReducer } from "./create-base-reducer.js";
import { tagStateReducer } from "./state-reducer.js";
import type { DocumentModelModule, Reducer, StateReducer } from "./types.js";

const reducer: Reducer = (document) => document;

function module(id: string, tagged: boolean): DocumentModelModule {
  return {
    documentModel: { global: { id } },
    reducer: tagged
      ? tagStateReducer(
          (...args: Parameters<Reducer>) => reducer(...args),
          {} as StateReducer,
        )
      : (...args: Parameters<Reducer>) => reducer(...args),
  } as unknown as DocumentModelModule;
}

function spyLogger() {
  return { debug: vi.fn(), warn: vi.fn() };
}

const v3 = { "base-reducer": 3 };

describe("fitCreateBaseReducer", () => {
  it("keeps 3 for a registered createReducer model", () => {
    const logger = spyLogger();
    expect(
      fitCreateBaseReducer(
        v3,
        "test/tagged",
        [module("test/tagged", true)],
        logger,
      ),
    ).toEqual(v3);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("gives an unregistered type 2 at debug level every time, never a warning", () => {
    const logger = spyLogger();
    for (let i = 0; i < 3; i++) {
      expect(fitCreateBaseReducer(v3, "test/missing", [], logger)).toEqual({
        "base-reducer": 2,
      });
    }
    for (let i = 0; i < 100; i++) {
      fitCreateBaseReducer(v3, `test/random-${i}`, [], logger);
    }
    expect(logger.debug).toHaveBeenCalledTimes(103);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("still warns once for an untagged reducer after the type was seen unregistered", () => {
    const logger = spyLogger();
    fitCreateBaseReducer(v3, "test/late", [], logger);
    const untagged = [module("test/late", false)];

    expect(fitCreateBaseReducer(v3, "test/late", untagged, logger)).toEqual({
      "base-reducer": 2,
    });
    fitCreateBaseReducer(v3, "test/late", untagged, logger);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("not built by createReducer"),
      "test/late",
    );
  });

  it("leaves an unknown type or a selection below 3 alone", () => {
    const logger = spyLogger();
    expect(fitCreateBaseReducer(v3, undefined, [], logger)).toEqual(v3);
    expect(
      fitCreateBaseReducer({ "base-reducer": 2 }, "test/missing", [], logger),
    ).toEqual({ "base-reducer": 2 });
    expect(logger.debug).not.toHaveBeenCalled();
  });
});
