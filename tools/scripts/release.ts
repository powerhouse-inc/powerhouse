/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-floating-promises */
import { releaseChangelog, releasePublish, releaseVersion } from "nx/release";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";


type ProjectsVersionData = Record<string, { newVersion?: string }>;

const branchRegexp = /^release\/[^\/\s]+\/v?\d+\.\d+\.\d+$/;
const validProductionBranches = ['prod', 'production'];

function getVersionFromProjectsVersionData(projectsVersionData: ProjectsVersionData) {
  let version: null | string = null;
  
  for (const [packageName, packageData] of Object.entries(projectsVersionData)) {
    const packageVersion = packageData.newVersion;

    if (!version && packageVersion) {
      version = packageVersion;
    }

    if (version !== null && packageVersion && packageVersion !== version) {
      throw new Error(`Version mismatch for ${packageName}: ${version} !== ${packageVersion}`);
    }
  }

  if (!version) {
    throw new Error('No version found in projectsVersionData');
  }

  return version;
}

(async () => {
  const options = yargs(hideBin(process.argv))
    .version(false)
    .option('version', {
      type: "string",
    })
    .option('tag', {
      type: "string",
    })
    .option('dry-run', {
      type: "boolean",
      default: false,
    })
    .option('verbose', {
      type: "boolean",
      default: false,
    })
    .option('skip-publish', {
      type: "boolean",
      default: false,
    })
    .option('publish-only', {
      type: "boolean",
      default: false,
    })
    .option('branch-release', {
      type: "string",
    })
    .parseSync();

  console.log('>>> options', options);
  const { version, tag, dryRun, verbose, skipPublish, publishOnly, branchRelease } = options;

  let specifier = version;
  let preid = tag;

  if (branchRelease) {
    if (!branchRegexp.test(branchRelease)) {
      console.error('>>> Invalid branch name', branchRelease);
      process.exit(1);
    }

    const [, branchTag, branchVersion] = branchRelease.split('/');
    const normalizedBranchVersion = branchVersion.replace("v", '');
    
    preid = validProductionBranches.includes(branchTag) ? undefined : branchTag;
    specifier =  preid ? `${normalizedBranchVersion}-${preid}.0` : normalizedBranchVersion;
  }

  if (!publishOnly) {
    const { workspaceVersion, projectsVersionData } = await releaseVersion({
      specifier,
      preid,
      dryRun,
      verbose,
    });
  
    await releaseChangelog({
      version: workspaceVersion || getVersionFromProjectsVersionData(projectsVersionData as ProjectsVersionData),
      versionData: projectsVersionData,
      dryRun,
      verbose,
    });
  }
  
  if (!skipPublish || publishOnly) {
    const publishResult = await releasePublish({
      tag: preid,
      dryRun,
      verbose,
    });

    if (Object.values(publishResult).some(result => result.code !== 0)) {
      console.error('>>> PUBLISH FAILED');
      console.error('>>> publishResult', publishResult);
      process.exit(1);
    }
  }

  process.exit(0);
})();