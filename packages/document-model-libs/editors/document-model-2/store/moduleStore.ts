import { Store } from "@tanstack/store";
import { TDocumentModel } from "../schemas/document-model";
import { Module } from "document-model/document-model";
import { docStore, renameDoc } from "./docStore";
import { renameMapKey } from "../lib";

export const moduleStore = new Store(new Map<string, Module>());

export function syncModulesFromDocument(document: TDocumentModel) {
  const modules = document.state.global.specifications[0].modules;

  moduleStore.setState((state) => {
    const newState = new Map(state);
    for (const module of modules) {
      newState.set(module.name, module);
    }
    return newState;
  });

  docStore.setState((state) => {
    const newState = new Map(state);
    for (const module of modules) {
      for (const operation of module.operations) {
        const operationName = operation.name!;
        const operationSchema = operation.schema!;
        const existingDoc = docStore.state.get(operationName);
        if (!existingDoc) {
          newState.set(operationName, operationSchema);
        } else {
          if (existingDoc !== operationSchema && !!operationSchema) {
            newState.set(operationName, operationSchema);
          }
        }
      }
    }

    return newState;
  });
}

export function renameModule(oldName: string, newName: string) {
  moduleStore.setState((state) => {
    const newState = renameMapKey(state, oldName, newName);
    return newState;
  });
}

export function renameOperation(
  moduleName: string,
  oldOperationName: string,
  newOperationName: string,
) {
  renameDoc(oldOperationName, newOperationName);
  moduleStore.setState((state) => {
    const newState = new Map(state);
    const newModule = structuredClone(newState.get(moduleName)!);
    const newOperations = newModule.operations.map((operation) => {
      if (operation.name! !== oldOperationName) return operation;
      return {
        ...operation,
        name: newOperationName,
      };
    });
    newModule.operations = newOperations;
    newState.set(moduleName, newModule);
    return newState;
  });
}
