import { DependencyVersions } from "../settings-modal/dependency-versions/dependency-versions.js";

type Props = {
  packageJson: unknown;
};
export function About(props: Props) {
  const { packageJson } = props;
  return (
    <div className="bg-white p-3">
      <h2 className="font-semibold">About</h2>
      <p className="text-sm font-normal text-gray-600">
        Connect is the hub for your most important documents and processes
        translated into software. Easily capture data in a structured way with
        Connect.
      </p>
      <div className="my-4">
        <DependencyVersions packageJson={packageJson} />
      </div>
    </div>
  );
}
