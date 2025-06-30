import {
  AnalyticsGranularity,
  AnalyticsPath,
  type AnalyticsQuery,
  DateTime,
  useAnalyticsQuery,
} from "@powerhousedao/reactor-browser/analytics";
import { type NodeTarget } from "./processor/index.js";

export type UseDocumentAnalyticsOptions = {
  from?: string;
  to?: string;
  granularity?: AnalyticsGranularity;
  levelOfDetail?: {
    drive?: number;
    operation?: number;
    target?: number;
  };
  filters?: {
    driveId?: string[];
    documentId?: string[];
    operation?: string[];
    target?: NodeTarget[];
    branch?: string[];
    scope?: string[];
  };
};

export const useDocumentAnalytics = (options: UseDocumentAnalyticsOptions) => {
  const start = options.from
    ? DateTime.fromISO(options.from)
    : DateTime.now().startOf("day");

  const end = options.to
    ? DateTime.fromISO(options.to)
    : DateTime.now().endOf("day");

  const granularity = options.granularity ?? AnalyticsGranularity.Daily;

  const lod = options.levelOfDetail ?? {
    drive: 1,
  };

  // Build drive dimension filters
  const selectDrives = options.filters?.driveId?.map((driveId) =>
    AnalyticsPath.fromString(`ph/doc/drive/${driveId}`),
  );

  // Build operation dimension filters
  const operations = options.filters?.operation?.map((operation) =>
    AnalyticsPath.fromString(`ph/doc/operation/${operation}`),
  );

  // Build target dimension filters
  const targets = options.filters?.target?.map((target) =>
    AnalyticsPath.fromString(`ph/doc/target/${target}`),
  );

  const select = {
    drive: selectDrives ?? [AnalyticsPath.fromString("ph/doc/drive")],
    ...(operations && { operation: operations }),
    ...(targets && { target: targets }),
  };

  // Build sources filter based on driveId and documentId
  let sources: AnalyticsPath[] | undefined;
  if (options.filters?.driveId || options.filters?.documentId) {
    sources = [];
    
    if (options.filters?.driveId && options.filters?.documentId) {
      // Specific drive and document combinations
      for (const driveId of options.filters.driveId) {
        for (const documentId of options.filters.documentId) {
          const branch = options.filters.branch?.[0] ?? "*";
          const scope = options.filters.scope?.[0] ?? "*";
          sources.push(
            AnalyticsPath.fromString(`ph/doc/${driveId}/${documentId}/${branch}/${scope}`)
          );
        }
      }
    } else if (options.filters?.driveId) {
      // All documents in specific drives
      for (const driveId of options.filters.driveId) {
        const branch = options.filters.branch?.[0] ?? "*";
        const scope = options.filters.scope?.[0] ?? "*";
        sources.push(
          AnalyticsPath.fromString(`ph/doc/${driveId}/*/${branch}/${scope}`)
        );
      }
    }
  }

  const config: AnalyticsQuery = {
    start,
    end,
    metrics: ["DocumentOperations"],
    granularity,
    lod,
    select,
  };

  const queryOptions = sources ? { sources } : undefined;

  const result = useAnalyticsQuery(config, queryOptions);

  return result;
};