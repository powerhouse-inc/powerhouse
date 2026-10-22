import { describe, expect, it } from "vitest";
import createWorkflowsPlugin, {
  workflowsDriveDeclaration,
  workflowsPlugin,
} from "../src/plugins/workflows.mjs";

// The workflows plugin DECLARES the drive it serves (workflow-plugins plan):
// a drive contribution the switchboard runner merges into the host's plan.
describe("workflows plugin — drive contribution from entry config", () => {
  it("contributes the classic Workflows drive by default (project-hashed id, Workflow Studio)", () => {
    expect(workflowsPlugin.contributions?.drives).toEqual([
      {
        slug: "workflows",
        name: "Workflows",
        preferredEditor: "workflow-studio",
        projectHash: "id",
      },
    ]);
    // the default export is the factory resolveHostPlugins calls with the
    // entry config; no config = the built-in instance's declaration
    expect(createWorkflowsPlugin({}).contributions).toEqual(
      workflowsPlugin.contributions,
    );
  });

  it("names the drive from the entry: slug, name, icon; a fixed id drops the hash", () => {
    const plugin = createWorkflowsPlugin({
      drive: { slug: "automations", name: "Automations", id: "automations" },
    });
    expect(plugin.contributions?.drives).toEqual([
      {
        slug: "automations",
        name: "Automations",
        id: "automations",
        preferredEditor: "workflow-studio",
      },
    ]);
    expect(
      workflowsDriveDeclaration({ drive: { icon: "./icons/flows.png" } }),
    ).toEqual({
      slug: "workflows",
      name: "Workflows",
      preferredEditor: "workflow-studio",
      projectHash: "id",
      icon: "./icons/flows.png",
    });
    // the vetra-style hashed slug stays available on request
    expect(
      workflowsDriveDeclaration({ drive: { projectHash: true } }),
    ).toMatchObject({ projectHash: true });
  });

  it("drive: false serves the runtime without seeding a drive", () => {
    expect(
      createWorkflowsPlugin({ drive: false }).contributions?.drives,
    ).toEqual([]);
  });

  it("rejects config it does not know (the entry's typo fails boot, not silently)", () => {
    expect(() => createWorkflowsPlugin({ drives: {} })).toThrow();
    expect(() => createWorkflowsPlugin({ drive: { slugg: "x" } })).toThrow();
    expect(
      workflowsPlugin.configSchema?.safeParse({ drive: { slug: "" } }).success,
    ).toBe(false);
  });

  it("keeps the transformServerOptions behaviour: presence forces workflows on unless explicitly off", () => {
    const hooks = createWorkflowsPlugin({ drive: false }).hooks!;
    const transform = hooks.transformServerOptions!;
    expect(transform({}, {} as never)).toEqual({
      workflows: { enabled: true },
    });
    expect(transform({ workflows: { enabled: false } }, {} as never)).toEqual({
      workflows: { enabled: false },
    });
  });
});
