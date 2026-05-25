import { DependencyVersions } from "../settings-modal/dependency-versions/dependency-versions.js";

type Props = {
  packageJson: unknown;
  phCliVersion?: string;
};
export function About(props: Props) {
  const { packageJson, phCliVersion } = props;
  return (
    <div className="bg-white p-3 dark:bg-slate-800">
      <h2 className="font-semibold text-gray-800 dark:text-slate-100">About</h2>
      <p className="text-sm font-normal text-gray-700 dark:text-slate-200">
        Connect is the hub for your most important documents and processes
        translated into software. Easily capture data in a structured way with
        Connect.
      </p>
      <div className="my-4">
        <DependencyVersions
          packageJson={packageJson}
          phCliVersion={phCliVersion}
        />
      </div>
    </div>
  );
}
