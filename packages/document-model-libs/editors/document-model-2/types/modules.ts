import { z } from "zod";
import { ConstantCase } from "./helpers";
import { InputObjectTypeDefinitionNode } from "graphql";
import {
  OperationTypeSchema,
  ScopeSchema,
  OperationSchema,
  ModuleSchema,
} from "../schemas/inputs";

export type OperationType = z.infer<typeof OperationTypeSchema>;

export type Scope = z.infer<typeof ScopeSchema>;

export type Operation = z.infer<typeof OperationSchema>;

export type Module = z.infer<typeof ModuleSchema>;

export type OperationNode = {
  id: string;
  operationName: ConstantCase;
  node: InputObjectTypeDefinitionNode;
  doc: string;
  scope: Scope;
};
