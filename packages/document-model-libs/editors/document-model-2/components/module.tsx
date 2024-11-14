import type {
  Operation,
  Module as TModule,
} from "document-model/document-model";
import { ModuleForm } from "./module-form";
import { Operations } from "./operations";
import { DocumentActionHandlers } from "../types";
import { Icon } from "@powerhousedao/design-system";
type Props = {
  module?: TModule;
  modules?: TModule[];
  allOperations: Operation[];
  lastCreatedModuleId: string | null;
  wrappedHandlers: DocumentActionHandlers & {
    addModule: (name: string) => Promise<string | undefined>;
  };
};
export function Module(props: Props) {
  const {
    module,
    modules,
    allOperations,
    lastCreatedModuleId,
    wrappedHandlers,
  } = props;
  return (
    <div className="relative rounded-3xl bg-gray-100 p-6">
      <div className="mb-2 w-1/2 pr-6">
        <ModuleForm
          modules={modules}
          handlers={wrappedHandlers}
          module={module}
        />
        {!!module && (
          <button
            aria-label="Delete module"
            tabIndex={-1}
            className="absolute right-1 top-1 p-2 text-gray-800 transition-colors hover:text-gray-500"
            onClick={() => {
              wrappedHandlers.deleteModule(module.id);
            }}
          >
            <Icon name="Xmark" size={32} />
          </button>
        )}
      </div>
      {!!module && (
        <Operations
          module={module}
          handlers={wrappedHandlers}
          allOperations={allOperations}
          shouldFocusNewOperation={module.id === lastCreatedModuleId}
        />
      )}
    </div>
  );
}
