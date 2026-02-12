import type { ProcessorModuleBaseOperationsOperations } from "@powerhousedao/vetra/document-models/processor-module";
import { PROCESSOR_APPS, type ProcessorApp } from "shared";

export const processorModuleBaseOperationsOperations: ProcessorModuleBaseOperationsOperations =
  {
    setProcessorNameOperation(state, action, dispatch) {
      const trimmedName = action.input.name.trim();
      if (trimmedName === "") {
        throw new Error("Processor name cannot be empty");
      }
      state.name = trimmedName;
    },
    setProcessorTypeOperation(state, action, dispatch) {
      const trimmedType = action.input.type.trim();
      if (trimmedType === "") {
        throw new Error("Processor type cannot be empty");
      }
      state.type = trimmedType;
    },
    addDocumentTypeOperation(state, action, dispatch) {
      // Check for duplicate ID
      const existingId = state.documentTypes.find(
        (dt) => dt.id === action.input.id,
      );
      if (existingId) {
        throw new Error(
          `Document type with id "${action.input.id}" already exists`,
        );
      }

      state.documentTypes.push({
        id: action.input.id,
        documentType: action.input.documentType,
      });
    },
    removeDocumentTypeOperation(state, action, dispatch) {
      state.documentTypes = state.documentTypes.filter(
        (documentType) => documentType.id !== action.input.id,
      );
    },
    setProcessorStatusOperation(state, action, dispatch) {
      state.status = action.input.status;
    },
    addProcessorAppOperation(state, action) {
      const { processorApp } = action.input;
      if (!PROCESSOR_APPS.includes(processorApp as ProcessorApp)) {
        throw new Error(
          `${processorApp} is not a valid processor app. Must be one of ${PROCESSOR_APPS.join(", ")}.`,
        );
      }
      state.processorApps = [
        ...new Set([...state.processorApps, processorApp]),
      ];
    },
    removeProcessorAppOperation(state, action) {
      const { processorApp } = action.input;
      state.processorApps = state.processorApps.filter(
        (p) => p !== processorApp,
      );
    },
  };
