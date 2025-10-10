import type { VetraProcessorConfigType } from "@powerhousedao/config";
import { VETRA_PROCESSOR_CONFIG_KEY } from "@powerhousedao/config";
import type { IProcessorHostModule, ProcessorRecord } from "document-drive";
import type { PHDocumentHeader } from "document-model";
import { CodegenProcessor } from "./index.js";

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

export const codegenProcessorFactory =
  (module: IProcessorHostModule) =>
  (driveHeader: PHDocumentHeader): ProcessorRecord[] => {
    // Create the processor
    const processorsConfig = module.config ?? new Map<string, unknown>();
    const vetraConfig = processorsConfig.get(VETRA_PROCESSOR_CONFIG_KEY) as
      | VetraProcessorConfigType
      | undefined;

    // Check if this drive should use the Vetra processor
    if (!isDriveVetra(driveHeader, vetraConfig?.driveId)) {
      return [];
    }

    const processor = new CodegenProcessor(vetraConfig?.interactive);
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
