import { connectConfig } from "@powerhousedao/connect/config";
import { packageJson } from "@powerhousedao/connect/utils";
import { Icon } from "@powerhousedao/design-system";
import { About as BaseAbout } from "@powerhousedao/design-system/connect";
import { closePHModal, showPHModal } from "@powerhousedao/reactor-browser";

export const About: React.FC = () => {
  const onOpenInspector = () => {
    closePHModal();
    showPHModal({ type: "inspector" });
  };

  return (
    <div>
      <BaseAbout
        packageJson={packageJson}
        phCliVersion={
          typeof connectConfig.phCliVersion === "string"
            ? connectConfig.phCliVersion
            : undefined
        }
      />
      <div className="bg-white p-3">
        <h2 className="mb-2 font-semibold">Inspector</h2>
        <p className="mb-3 text-sm font-normal text-gray-600">
          Explore the local database and sync state for debugging.
        </p>
        <button
          className="flex items-center gap-x-2 rounded-md border border-gray-300 bg-transparent px-3 py-1 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100"
          onClick={onOpenInspector}
          type="button"
        >
          Open Inspector <Icon name="CircleInfo" size={16} />
        </button>
      </div>
    </div>
  );
};
