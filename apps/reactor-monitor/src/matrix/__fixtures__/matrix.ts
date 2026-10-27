import type { HostExport } from "@powerhousedao/host-core/schema";
import {
  HOST_EXPORTS,
  type HostExportFixture,
} from "../../lib/__fixtures__/host-export/index.js";
import {
  matrixDefinitionSchema,
  type AxisValue,
  type MatrixDefinition,
  type MatrixDefinitionInput,
} from "../schema.js";

export function hostExport(name: HostExportFixture): HostExport {
  return JSON.parse(HOST_EXPORTS[name]) as HostExport;
}

export function definition(
  fields: Partial<MatrixDefinitionInput> = {},
): MatrixDefinition {
  return matrixDefinitionSchema.parse({
    format: "ph-monitor-matrix",
    version: 1,
    name: "test",
    base: { project: "/project", host: "switchboard" },
    axes: [{ key: "a", values: [{ key: "x" }] }],
    ...fields,
  });
}

export function axisValue(
  key: string,
  fields: Partial<Omit<AxisValue, "key">> = {},
): AxisValue {
  return { key, setters: [], env: {}, requires: [], expect: {}, ...fields };
}

export const CAPS = { postgres: true, maxInstances: 8 } as const;
export const NO_PG = { postgres: false, maxInstances: 8 } as const;
