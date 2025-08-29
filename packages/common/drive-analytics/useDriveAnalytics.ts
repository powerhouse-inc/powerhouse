import type { AnalyticsQuery } from "@powerhousedao/reactor-browser";
import {
  AnalyticsGranularity,
  AnalyticsPath,
  DateTime,
  useAnalyticsQuery,
} from "@powerhousedao/reactor-browser";
import type { ActionType, Target } from "./processor/index.js";

export type UseDriveAnalyticsOptions = {
  from?: string;
  to?: string;
  granularity?: AnalyticsGranularity;
  levelOfDetail?: {
    drive?: number;
    operation?: number;
    target?: number;
    actionType?: number;
  };
  filters?: {
    driveId?: string[];
    operation?: string[];
    target?: Target[];
    actionType?: ActionType[];
  };
};

export const useDriveAnalytics = (options: UseDriveAnalyticsOptions) => {
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

  const selectDrives = options.filters?.driveId?.map((driveId) =>
    AnalyticsPath.fromString(`ph/drive/${driveId}`),
  );

  const operations = options.filters?.operation?.map((operation) =>
    AnalyticsPath.fromString(`ph/drive/operation/${operation}`),
  );

  const targets = options.filters?.target?.map((target) =>
    AnalyticsPath.fromString(`ph/drive/target/${target}`),
  );

  const actionTypes = options.filters?.actionType?.map((actionType) =>
    AnalyticsPath.fromString(`ph/drive/actionType/${actionType}`),
  );

  const select = {
    drive: selectDrives ?? [AnalyticsPath.fromString("ph/drive")],
    ...(operations && { operation: operations }),
    ...(targets && { target: targets }),
    ...(actionTypes && { actionType: actionTypes }),
  };

  const config: AnalyticsQuery = {
    start,
    end,
    metrics: ["DriveOperations"],
    granularity,
    lod,
    select,
  };

  const result = useAnalyticsQuery(config);

  return result;
};
