import {
  buildActionContext,
  InMemoryKeyValueStore,
  UnsupportedContextMemberError,
} from "../../../src/pieces/activepieces/context/action.js";

describe("buildActionContext", () => {
  it("exposes the implemented tier: executionType, auth, propsValue, store", async () => {
    const { context: ctx } = buildActionContext({
      propsValue: { url: "https://example.com" },
      auth: { token: "t" },
    });
    expect(ctx.executionType).toBe("BEGIN");
    expect(ctx.auth).toEqual({ token: "t" });
    expect(ctx.propsValue).toEqual({ url: "https://example.com" });

    await ctx.store.put("k", { n: 1 });
    expect(await ctx.store.get("k")).toEqual({ n: 1 });
    await ctx.store.delete("k");
    expect(await ctx.store.get("k")).toBeNull();
  });

  it("uses an injected store", async () => {
    const store = new InMemoryKeyValueStore();
    await store.put("seed", "value");
    const { context: ctx } = buildActionContext({ propsValue: {}, store });
    expect(await ctx.store.get("seed")).toBe("value");
  });

  it("throws a named error from unimplemented capability methods", () => {
    const { context: ctx } = buildActionContext({ propsValue: {} });

    expect(() =>
      ctx.files.write({ fileName: "f.txt", data: Buffer.from("x") }),
    ).toThrowError(UnsupportedContextMemberError);
    try {
      void ctx.connections.get("key");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedContextMemberError);
      expect((error as UnsupportedContextMemberError).member).toBe(
        "connections.get",
      );
    }
    expect(() => ctx.server.apiUrl).toThrowError(UnsupportedContextMemberError);
    expect(() => ctx.run.stop()).toThrowError(UnsupportedContextMemberError);
    expect(() => ctx.generateResumeUrl({ queryParams: {} })).toThrowError(
      UnsupportedContextMemberError,
    );
  });

  it("provides identity data without throwing", async () => {
    const { context: ctx } = buildActionContext({
      propsValue: {},
      identity: {
        runId: "r1",
        projectId: "p1",
        flowId: "f1",
        flowVersionId: "v1",
        stepName: "s1",
      },
    });
    expect(ctx.run.id).toBe("r1");
    expect(await ctx.project.externalId()).toBe("p1");
    expect(ctx.flows.current).toEqual({ id: "f1", version: { id: "v1" } });
    expect(ctx.step.name).toBe("s1");
  });

  it("tracks touched members, flagging undocumented reads", () => {
    const onTouch = vi.fn();
    const { context, touched } = buildActionContext({
      propsValue: {},
      onTouch,
    });
    void context.propsValue;
    void (context as unknown as Record<string, unknown>).somethingNew;
    expect([...touched].sort()).toEqual([
      "UNDOCUMENTED:somethingNew",
      "propsValue",
    ]);
    expect(onTouch).toHaveBeenCalledWith("propsValue");
    expect(onTouch).toHaveBeenCalledWith("UNDOCUMENTED:somethingNew");
  });

  it("stays await-safe: awaiting a stub member does not throw", async () => {
    const { context: ctx } = buildActionContext({ propsValue: {} });
    await expect(Promise.resolve(ctx.files)).resolves.toBeDefined();
  });
});
