import { useState } from "react";
import { Disclosure } from "../../../disclosure/disclosure.js";

const PH_DEPENDENCIES = [
  /^@powerhousedao\/.+$/,
  "document-drive",
  "document-model",
];

type ValidatedPackageJson = {
  version: string;
  dependencies: Record<string, string>;
};

export function verifyPackageJsonFields(
  packageJson: unknown,
): ValidatedPackageJson | false {
  try {
    const parsed = packageJson as {
      version?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const version = parsed.version || "Missing version field in package.json";
    const dependencies = Object.fromEntries(
      Object.entries({
        ...parsed.dependencies,
        ...parsed.devDependencies,
        ...parsed.peerDependencies,
      }).filter(([key]) =>
        PH_DEPENDENCIES.some((regexOrName) =>
          typeof regexOrName === "string"
            ? regexOrName === key
            : regexOrName.test(key),
        ),
      ),
    );
    return { version, dependencies };
  } catch (error) {
    console.error(error);
    return false;
  }
}

type Props = {
  readonly packageJson: unknown;
  readonly phCliVersion?: string;
};

export function DependencyVersions(props: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const { packageJson, phCliVersion } = props;

  const validatedData = verifyPackageJsonFields(packageJson);
  if (!validatedData) {
    console.error("Failed to validate package.json data");
    return null;
  }

  return (
    <Disclosure
      isOpen={isOpen}
      onOpenChange={() => setIsOpen(!isOpen)}
      title={`App version: ${validatedData.version}`}
      toggleClassName="text-gray-900 text-sm"
    >
      <ul className="text-sm text-gray-600">
        {Object.entries(validatedData.dependencies).map(([dep, version]) => (
          <li key={dep} className="my-1 flex justify-between pr-1">
            <span>{dep.replace("@powerhousedao/", "")}:</span>
            <span className="font-normal">{version}</span>
          </li>
        ))}
        {phCliVersion && (
          <li className="my-1 flex justify-between pr-1" key="ph-cli">
            <span>@powerhousedao/ph-cli:</span>
            <span className="font-normal">{phCliVersion}</span>
          </li>
        )}
      </ul>
    </Disclosure>
  );
}
