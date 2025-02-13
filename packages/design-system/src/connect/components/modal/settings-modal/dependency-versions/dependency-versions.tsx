import { useState } from "react";
import { object, record, string } from "zod";
import { Disclosure } from "../../../disclosure";

const REQUIRED_DEPENDENCIES = [
  "@powerhousedao/design-system",
  "document-drive",
  "document-model",
  "document-model-libs",
] as const;

type RequiredDependencies = Record<
  (typeof REQUIRED_DEPENDENCIES)[number],
  string
>;

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

    // Check if all required dependencies exist
    const missingDeps = REQUIRED_DEPENDENCIES.filter(
      (dep) =>
        !allDependencies[dep] || typeof allDependencies[dep] !== "string",
    );

    if (missingDeps.length > 0) {
      console.error(
        "Missing or invalid dependencies:",
        missingDeps,
        "Available dependencies:",
        Object.keys(allDependencies),
      );
      return false;
    }

    return {
      version: data.version,
      dependencies: Object.fromEntries(
        REQUIRED_DEPENDENCIES.map((dep) => [dep, allDependencies[dep]]),
      ) as RequiredDependencies,
    };
  });

type ValidatedPackageJson = {
  version: string;
  dependencies: RequiredDependencies;
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
        {REQUIRED_DEPENDENCIES.map((dep) => (
          <li key={dep} className="my-1 flex justify-between pr-1">
            <span>{dep.replace("@powerhousedao/", "")}:</span>
            <span className="font-normal">
              {validatedData.dependencies[dep]}
            </span>
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
