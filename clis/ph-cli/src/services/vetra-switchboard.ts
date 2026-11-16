import type { VetraProcessorConfigType } from "@powerhousedao/config";
import { blue } from "colorette";
import {
  configureVetraGithubUrl,
  sleep,
} from "../utils/configure-vetra-github-url.js";

/**
 * What makes a started switchboard the VETRA switchboard: used by the vetra
 * host's switchboard member (runners/switchboard.ts).
 */

export interface VetraDriveSource {
  interactive: boolean | undefined;
  /** `--remote-drive` (or the host's declared remote vetra drive). */
  remoteDrive: string | undefined;
  /** The project's own vetra drive, used when no remote one is given. */
  localDriveUrl: string;
  localDriveId: string;
}

/** The codegen processor's config (`VetraConfig`): the drive it generates
 * from is the remote drive when one is given, else the project's own. */
export function vetraProcessorConfigOf(
  source: VetraDriveSource,
): VetraProcessorConfigType {
  const { interactive, remoteDrive, localDriveUrl, localDriveId } = source;
  return {
    interactive,
    driveUrl: remoteDrive ?? localDriveUrl,
    driveId: remoteDrive?.split("/").pop() ?? localDriveId,
  };
}

export interface VetraSwitchboardUrls {
  verbose: boolean | undefined;
  remoteDrive: string | undefined;
  switchboardPort: number;
  driveUrl: string | undefined;
  previewDriveUrl?: string | null;
  workflowsDriveUrl?: string | null;
}

/** The lines a started Vetra switchboard prints: where it listens and the
 * drives it serves. */
export function printVetraSwitchboardUrls(urls: VetraSwitchboardUrls): void {
  const { verbose, remoteDrive, previewDriveUrl, workflowsDriveUrl } = urls;
  if (verbose) {
    console.log(blue(`Vetra Switchboard: Started successfully`));
    if (remoteDrive) {
      console.log(
        blue(`Vetra Switchboard: Syncing with remote drive: ${remoteDrive}`),
      );
    }
  } else {
    console.log();
    console.log(
      blue(
        `Vetra Switchboard: http://localhost:${urls.switchboardPort}/graphql`,
      ),
    );
    console.log(blue(`   ➜ Drive URL: ${urls.driveUrl}`));
    if (previewDriveUrl) {
      console.log(blue(`   ➜ Preview Drive URL: ${previewDriveUrl}`));
    }
    if (workflowsDriveUrl) {
      console.log(blue(`   ➜ Workflows Drive URL: ${workflowsDriveUrl}`));
    }
  }
}

/** Configure the GitHub URL of the package document in a remote vetra drive. */
export async function configureVetraRemoteDrive(
  switchboardPort: number,
  remoteDrive: string,
  verbose: boolean | undefined,
): Promise<void> {
  // give some time for the drive to process initial strands
  await sleep(3000);

  await configureVetraGithubUrl(switchboardPort, remoteDrive, verbose);

  // give some time for the user to read log messages
  await sleep(2000);
}
