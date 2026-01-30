import { releaseVersion } from "nx/release";

const { workspaceVersion, projectsVersionData } = await releaseVersion({
  preid: "dev",
  // dryRun: true,
});

console.log({ workspaceVersion, projectsVersionData });
