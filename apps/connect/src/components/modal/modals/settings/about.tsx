import { connectConfig } from "@powerhousedao/connect/config";
import { About as BaseAbout } from "@powerhousedao/design-system";
import packageJson from "../../../../../package.copy.json" with { type: "json" };

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
