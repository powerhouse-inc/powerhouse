/**
 * The code-first declaration of subgraph-module, equivalent to the stored
 * schema-first model in this repository down to every persisted byte.
 *
 * Reducers are empty: this fixture proves specification equality, which is
 * what `test/parity` compares. `test/replay` covers replay behavior with
 * its own pair.
 */
import { ph } from "../../../src/definition/field.js";
import { schemaFirstSpecification } from "../../../src/definition/compatibility.js";
import { defineDocumentModel } from "../../../src/definition/model.js";

const StatusType = ph.enum("StatusType", {
  description:
    "Lifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.",
  values: ["DRAFT", "CONFIRMED"],
});

const contextV1 = defineDocumentModel({
  id: "powerhouse/subgraph",
  name: "Subgraph Module",
  description:
    "Declares a GraphQL subgraph (a slice of the Switchboard API contributed by the package) shipped by a Vetra Reactor Package. Create one Subgraph Module document per subgraph, then mark it CONFIRMED to trigger codegen of the subgraph scaffold under `subgraphs/` — the resolvers and schema you flesh out there are stitched into the Switchboard graph at runtime.",
  extension: ".subgraph",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  specifications: {
    global: {
      schema: ph.object("SubgraphModuleState", {
        description:
          "Configuration for a GraphQL subgraph contributed by the package. The subgraph\nis served by Switchboard and stitched into the unified Powerhouse API.",
        fields: {
          name: ph.String({
            required: true,
            description:
              "Display name of the subgraph. Also determines the generated folder name under `subgraphs/` and the route segment Switchboard mounts it at.",
          }),
          status: ph.ref(StatusType, {
            required: true,
            description:
              "Lifecycle status. While DRAFT the subgraph definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation.",
          }),
        },
      }),
      initialValue: {
        name: "",
        status: "DRAFT",
      },
    },
    local: {
      schema: null,
      initialValue: {},
    },
  },
});

const baseOperationsV1 = contextV1.module("baseOperations", {
  description: "Set the subgraph's identity and lifecycle status.",
  operations: ({ global }) => ({
    setSubgraphName: global({
      input: ph.input({
        fields: {
          name: ph.String({ required: true }),
        },
      }),
      description:
        "Set the display name of the subgraph. Also determines the generated folder under `subgraphs/` and the route segment Switchboard mounts it at.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setSubgraphStatus: global({
      input: ph.input({
        fields: {
          status: ph.ref(StatusType, { required: true }),
        },
      }),
      description:
        "Move the subgraph between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

export const DefinitionV1 = contextV1.finalize({
  modules: [baseOperationsV1],
  compatibility: schemaFirstSpecification({
    ids: {
      "module/baseOperations": "8af5bda9-6fc7-4427-bfed-1d32d76a552f",
      "operation/baseOperations/setSubgraphName":
        "d7cd6b6b-01ea-42c8-97e2-288e04b50b42",
      "operation/baseOperations/setSubgraphStatus":
        "5a20e641-dc36-428e-8924-ecb07f3f1b94",
    },
    names: {
      "module/baseOperations": { storedName: "base_operations" },
      "operation/baseOperations/setSubgraphName": {
        storedName: "SET_SUBGRAPH_NAME",
      },
      "operation/baseOperations/setSubgraphStatus": {
        storedName: "SET_SUBGRAPH_STATUS",
      },
    },
    serialization: {
      "state/global/schema":
        '"""\nConfiguration for a GraphQL subgraph contributed by the package. The subgraph\nis served by Switchboard and stitched into the unified Powerhouse API.\n"""\ntype SubgraphModuleState {\n  """Display name of the subgraph. Also determines the generated folder name under `subgraphs/` and the route segment Switchboard mounts it at."""\n  name: String!\n  """Lifecycle status. While DRAFT the subgraph definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation."""\n  status: StatusType!\n}\n\n"""\nLifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.\n"""\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}',
      "state/global/initialValue": '{\n  "name": "",\n  "status": "DRAFT"\n}',
      "state/local/initialValue": "",
      "operation/baseOperations/setSubgraphName/schema":
        "input SetSubgraphNameInput {\n  name: String!\n}",
      "operation/baseOperations/setSubgraphStatus/schema":
        "input SetSubgraphStatusInput {\n  status: StatusType!\n}",
    },
  }),
});

export const modules = [DefinitionV1];
