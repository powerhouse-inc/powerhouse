import { connectConfig } from "@powerhousedao/connect/config";
import packageJson from "@powerhousedao/connect/package.json" with { type: "json" };
import { About as BaseAbout } from "@powerhousedao/design-system/connect/components/modal/settings-modal-v2/about";

export const About: React.FC = () => {
  return (
    <BaseAbout
      packageJson={packageJson}
      phCliVersion={
        typeof connectConfig.phCliVersion === "string"
          ? connectConfig.phCliVersion
          : undefined
      }
    />
  );
};
