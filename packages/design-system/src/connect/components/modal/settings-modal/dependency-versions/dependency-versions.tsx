import { useState } from "react";
import { object, record, string } from "zod";
import { Disclosure } from "../../../disclosure/index.js";

const PH_DEPENDENCIES = [
  /^@powerhousedao\/.+$/,
  "document-drive",
  "document-model",
];

const PackageJsonSchema = object({
  version: string({ message: "Missing version field in package.json" }),
  dependencies: record(string(), string()).nullable(),
  devDependencies: record(string(), string()).nullable(),
})
  .refine(
    (data) => data.dependencies != null || data.devDependencies != null,
    "package.json must have either dependencies or devDependencies",
  )
  .transform((data) => {
    const allDependencies = {
      ...data.dependencies,
      ...data.devDependencies,
    };

    return {
      version: data.version,
      dependencies: Object.fromEntries(
        Object.entries(allDependencies).filter(([key]) =>
          PH_DEPENDENCIES.some((regexOrName) =>
            typeof regexOrName === "string"
              ? regexOrName === key
              : regexOrName.test(key),
          ),
        ),
      ),
    };
  });

type ValidatedPackageJson = {
  version: string;
  dependencies: Record<string, string>;
};

export function verifyPackageJsonFields(
  packageJson: unknown,
): ValidatedPackageJson | false {
  const parsed = PackageJsonSchema.safeParse(packageJson);
  if (!parsed.success) {
    console.error("Package.json validation failed:", parsed.error.format());
    return false;
  }
  return parsed.data;
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
