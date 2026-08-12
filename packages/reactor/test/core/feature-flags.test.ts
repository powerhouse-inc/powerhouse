import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { describe, expect, it } from "vitest";
import {
  FLAG_PREREQUISITES,
  resolveFeatureFlags,
  validateFeatureFlags,
} from "../../src/core/feature-flags.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";

/**
 * The flags govern how much the reactor enforces, so a configuration asking for
 * more than it can deliver has to fail at construction. Silently ignoring it
 * reads as enforcement being on.
 */
describe("feature flag validation", () => {
  /**
   * A later stage's table, so the prerequisite rule is covered before a flag
   * with prerequisites exists.
   */
  const laterStages = {
    documentDecisions: [],
    authEnforcement: ["documentDecisions"],
    authGroups: ["authEnforcement"],
    authConditions: ["authGroups"],
    hypotheticalLaterStage: ["authConditions"],
  };

  it("accepts a flag whose prerequisites are all on", () => {
    expect(() =>
      validateFeatureFlags(
        { documentDecisions: true, authEnforcement: true },
        laterStages,
      ),
    ).not.toThrow();
  });

  it("rejects a flag whose prerequisite is off", () => {
    expect(() =>
      validateFeatureFlags({ authEnforcement: true }, laterStages),
    ).toThrow(/authEnforcement requires documentDecisions/);
  });

  it("names every missing prerequisite", () => {
    expect(() =>
      validateFeatureFlags(
        { authGroups: true, authEnforcement: false },
        laterStages,
      ),
    ).toThrow(/authGroups requires authEnforcement/);
  });

  it("ignores prerequisites of a flag that is off", () => {
    expect(() =>
      validateFeatureFlags(
        { authEnforcement: false, authGroups: false },
        laterStages,
      ),
    ).not.toThrow();
  });

  it("rejects a name this reactor does not know", () => {
    expect(() =>
      validateFeatureFlags(
        { hypotheticalLaterStage: true },
        FLAG_PREREQUISITES,
      ),
    ).toThrow(/Unrecognized reactor feature flag: hypotheticalLaterStage/);
  });

  it("declares only the flags that are implemented", () => {
    expect(Object.keys(FLAG_PREREQUISITES)).toEqual([
      "documentDecisions",
      "authEnforcement",
      "authGroups",
      "authConditions",
    ]);
  });

  it("throws from the builder rather than at the first operation", async () => {
    const builder = new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({
        featureFlags: { hypotheticalLaterStage: true } as never,
      });

    await expect(builder.build()).rejects.toThrow(
      /Unrecognized reactor feature flag: hypotheticalLaterStage/,
    );
  });

  it("rejects authConditions without authGroups from the builder", async () => {
    const builder = new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({
        featureFlags: {
          documentDecisions: true,
          authEnforcement: true,
          authConditions: true,
        },
      });

    await expect(builder.build()).rejects.toThrow(
      /authConditions requires authGroups/,
    );
  });

  it("rejects authGroups without authEnforcement from the builder", async () => {
    const builder = new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({
        featureFlags: { documentDecisions: true, authGroups: true },
      });

    await expect(builder.build()).rejects.toThrow(
      /authGroups requires authEnforcement/,
    );
  });

  it("rejects authEnforcement without documentDecisions from the builder", async () => {
    const builder = new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({ featureFlags: { authEnforcement: true } });

    await expect(builder.build()).rejects.toThrow(
      /authEnforcement requires documentDecisions/,
    );
  });

  it("builds with authEnforcement once documentDecisions is on", async () => {
    const reactor = await new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({
        featureFlags: { documentDecisions: true, authEnforcement: true },
      })
      .build();

    reactor.kill();
  });

  it("builds with a flag it knows", async () => {
    const reactor = await new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({ featureFlags: { documentDecisions: true } })
      .build();

    reactor.kill();
  });
});

/**
 * Every consumer resolves the same partial flag set, and the read surface is
 * one of them, so the resolution is shared rather than repeated.
 */
describe("resolveFeatureFlags", () => {
  it("defaults every flag off", () => {
    expect(resolveFeatureFlags()).toEqual({
      documentDecisions: false,
      authEnforcement: false,
      authGroups: false,
      authConditions: false,
    });
    expect(resolveFeatureFlags({})).toEqual(resolveFeatureFlags());
  });

  it("fills in the flags the caller left out", () => {
    expect(resolveFeatureFlags({ documentDecisions: true })).toEqual({
      documentDecisions: true,
      authEnforcement: false,
      authGroups: false,
      authConditions: false,
    });
  });

  it("still validates what the caller passed", () => {
    expect(() => resolveFeatureFlags({ authEnforcement: true })).toThrow(
      /authEnforcement requires documentDecisions/,
    );
    expect(() =>
      resolveFeatureFlags({ hypotheticalLaterStage: true } as never),
    ).toThrow(/Unrecognized reactor feature flag/);
  });

  it("reports the resolved flags on the module the client is built from", async () => {
    const module = await new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({
        featureFlags: { documentDecisions: true, authEnforcement: true },
      })
      .buildModule();

    expect(module.featureFlags).toEqual({
      documentDecisions: true,
      authEnforcement: true,
      authGroups: false,
      authConditions: false,
    });

    module.reactor.kill();
  });
});
