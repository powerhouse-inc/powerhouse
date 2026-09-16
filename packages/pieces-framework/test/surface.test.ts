import { describe, expect, expectTypeOf, it } from "vitest";
import * as common from "../src/common.js";
import * as framework from "../src/index.js";
import type {
  InputPropertyMap,
  PackagePiece,
  PowerhouseActionContext,
  PowerhousePropertyContext,
  PowerhouseTriggerHookContext,
  ReactorService,
  SeekPage,
  TriggerStrategy,
} from "../src/index.js";

describe("public surface", () => {
  it("re-exports the Activepieces framework from the root", () => {
    expect(framework.createPiece).toBeTypeOf("function");
    expect(framework.createAction).toBeTypeOf("function");
    expect(framework.createTrigger).toBeTypeOf("function");
    expect(
      framework.Property.ShortText({ displayName: "Name", required: true })
        .type,
    ).toBe(framework.PropertyType.SHORT_TEXT);
    expect(framework.PieceAuth.None()).toBeUndefined();
    expect(framework.PieceCategory.CORE).toBe("CORE");
    expect(framework.TriggerStrategy.POLLING).toBe("POLLING");
    expect(framework.isNil(null)).toBe(true);
    expect(framework.isNil(0)).toBe(false);
    const page: SeekPage<string> = { data: ["a"], next: null, previous: null };
    expect(page.data).toEqual(["a"]);
  });

  it("re-exports pieces-common from ./common", () => {
    expect(typeof common.httpClient.sendRequest).toBe("function");
    expect(common.HttpMethod.GET).toBe("GET");
    expect(common.AuthenticationType.BEARER_TOKEN).toBe("BEARER_TOKEN");
    expect(typeof common.pollingHelper.poll).toBe("function");
  });

  it("widens every piece context with the reactor", () => {
    expectTypeOf<PowerhouseActionContext>()
      .toHaveProperty("reactor")
      .toEqualTypeOf<ReactorService>();
    expectTypeOf<PowerhousePropertyContext>()
      .toHaveProperty("reactor")
      .toEqualTypeOf<ReactorService>();
    expectTypeOf<
      PowerhouseTriggerHookContext<
        undefined,
        InputPropertyMap,
        TriggerStrategy.POLLING
      >
    >()
      .toHaveProperty("reactor")
      .toEqualTypeOf<ReactorService>();
    const piece: PackagePiece = {
      name: "@acme/pieces-invoices",
      version: "1.0.0",
      entry: "pieces/invoices/index.ts",
    };
    expect(piece.bundle).toBeUndefined();
  });

  it("reactorOf hands back ctx.reactor and names it when absent", () => {
    const reactor = {
      models: () => Promise.resolve([]),
    } as unknown as ReactorService;
    expect(framework.reactorOf({ reactor })).toBe(reactor);
    expect(() => framework.reactorOf({})).toThrow(/ctx\.reactor/);
    expect(() => framework.reactorOf(undefined)).toThrow(/ctx\.reactor/);
    expect(() => framework.reactorOf(null)).toThrow(/Powerhouse reactor/);
  });
});
