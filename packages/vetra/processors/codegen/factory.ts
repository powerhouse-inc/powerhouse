import type { VetraProcessorConfigType } from "@powerhousedao/config";
import { VETRA_PROCESSOR_CONFIG_KEY } from "@powerhousedao/config";
import type {
  IProcessorHostModule,
  ProcessorFactoryBuilder,
  ProcessorRecord,
} from "@powerhousedao/reactor-browser";
import type { PHDocumentHeader } from "@powerhousedao/shared/document-model";
import { logger } from "./logger.js";

/**
 * Determines if a drive header matches the Vetra drive criteria.
 * @param driveHeader - The drive header to check
 * @param explicitDriveId - Optional explicit drive ID from config (if set, uses exact match)
 * @returns true if the drive is a Vetra drive, false otherwise
 */
function isDriveVetra(
  driveHeader: PHDocumentHeader,
  driveIdFromConfig?: string,
): boolean {
  // If explicit drive ID is configured, use exact match
  if (driveIdFromConfig) {
    return (
      driveHeader.slug === driveIdFromConfig ||
      driveHeader.id === driveIdFromConfig
    );
  }

  // Otherwise, check if slug/id matches Vetra pattern
  // Matches "vetra" exactly or IDs starting with "vetra-" (case-insensitive)
  const matchesPattern = (identifier: string): boolean => {
    const lower = identifier.toLowerCase();
    return lower === "vetra" || lower.startsWith("vetra-");
  };

  return matchesPattern(driveHeader.slug) || matchesPattern(driveHeader.id);
}

export const codegenFactoryBuilder: ProcessorFactoryBuilder = (
  module: IProcessorHostModule,
) => {
  return async (driveHeader: PHDocumentHeader): Promise<ProcessorRecord[]> => {
    const processorsConfig = module.config ?? new Map<string, unknown>();
    const vetraConfig = processorsConfig.get(VETRA_PROCESSOR_CONFIG_KEY) as
      | VetraProcessorConfigType
      | undefined;

    // Exit early if it's not a vetra drive
    if (!isDriveVetra(driveHeader, vetraConfig?.driveId)) {
      logger.debug(
        `Drive ${driveHeader.slug} is not a Vetra drive, skipping codegen processor`,
      );
      return [];
    }

    logger.info(
      `Drive ${driveHeader.slug} is a Vetra drive, using codegen processor`,
    );

    // Lazy-load codegen only once a Vetra drive is confirmed.
    const [{ buildTsMorphProject }, { getConfig }, { CodegenProcessor }] =
      await Promise.all([
        import("@powerhousedao/codegen/utils"),
        import("@powerhousedao/config/node"),
        import("./processor.js"),
      ]);

    const config = getConfig();
    const cwd = process.cwd();

    /* Use one instance of ts-morph project, which handles race conditions */
    const project = buildTsMorphProject(cwd);
    const processor = new CodegenProcessor(
      project,
      config,
      cwd,
      vetraConfig?.interactive,
    );
    return [
      {
        processor,
        filter: {
          branch: ["main"],
          documentId: ["*"],
          documentType: [
            "powerhouse/document-model",
            "powerhouse/package",
            "powerhouse/document-editor",
            "powerhouse/subgraph",
            "powerhouse/processor",
            "powerhouse/app",
          ],
          scope: ["global"],
        },
      },
    ];
  };
};
