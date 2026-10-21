import {
  REACTOR_DRIVE_SUBGRAPH_NAME,
  type IDriveReadModel,
} from "@powerhousedao/reactor-drive";
import type { WorkflowRuntimeService } from "@powerhousedao/reactor-workflow";
import { fileURLToPath } from "node:url";
import { it, vi } from "vitest";
import {
  coreGoldenNames,
  createGoldenHost,
} from "../../../packages/reactor-api/test/golden/capture.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../../../packages/reactor-api/src/services/authorization.service.js";
import { ReactorDriveSubgraph } from "../src/drive-subgraph.js";
import { PrivacySubgraph } from "../src/privacy-subgraph.js";
import { createWorkflowRuntimeSubgraph } from "../src/workflow/subgraph.js";

vi.mock(
  "../../../packages/reactor-api/src/graphql/reactor/schema.graphql",
  () =>
    vi.importActual<{ default: string }>(
      "../../../packages/reactor-api/src/graphql/reactor/schema.graphql?raw",
    ),
);

it("preserves switchboard Workflow, Drive and Privacy authoring, mounts, federation and HTTP schemas", async () => {
  const host = await createGoldenHost();
  try {
    const WorkflowSubgraph = createWorkflowRuntimeSubgraph(
      {} as WorkflowRuntimeService,
    );
    await host.manager.registerSubgraphInstance(
      new WorkflowSubgraph(host.args),
      "graphql",
      false,
    );
    await host.manager.registerSubgraphInstance(
      new ReactorDriveSubgraph(host.args, {} as IDriveReadModel),
      "graphql",
      false,
    );
    const privacy = new PrivacySubgraph(
      {
        ...host.args,
        authorizationService: createAuthorizationService({
          admins: ["0xadmin"],
          defaultProtection: true,
          policy: AuthorizationPolicy.ADMIN_ONLY,
        }),
      },
      {
        erasure: { plan: vi.fn(), request: vi.fn(), status: vi.fn() },
        disclosure: { disclose: vi.fn() },
      },
    );
    await host.manager.registerSubgraphInstance(privacy, "graphql", false);
    await host.capture(
      fileURLToPath(new URL("./__golden__/", import.meta.url)),
      [
        ...coreGoldenNames,
        "workflow-runtime",
        REACTOR_DRIVE_SUBGRAPH_NAME,
        "privacy",
      ],
    );
  } finally {
    await host.close();
  }
}, 30_000);
