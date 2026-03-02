import { AnalyticsModel } from "./AnalyticsModel.js";

export const AnalyticsResolvers: any = {
  Query: {
    analytics: (_: any, __: any, { dataSources }: any) => {
      return {};
    },
  },
  AnalyticsQuery: {
    series: async (parent: any, { filter }: any, { dataSources }: any) => {
      const queryEngine: AnalyticsModel = dataSources.db.Analytics;
      const results = await queryEngine.query(filter);
      return results.map((s) => ({
        ...s,
        rows: s.rows.map((r: any) => ({
          ...r,
          dimensions: Object.keys(r.dimensions).map((d) => ({
            name: d,
            path: r.dimensions[d]["path"],
            icon: r.dimensions[d]["icon"],
            label: r.dimensions[d]["label"],
            description: r.dimensions[d]["description"],
          })),
        })),
      }));
    },
    metrics: async (parent: any, { filter }: any, { dataSources }: any) => {
      return [
        "Actuals",
        "AuditorNetOutflow",
        "Budget",
        "Contributors",
        "Count",
        "DailyDaiPriceChange",
        "DailyEthPriceChange",
        "DailyMkrPriceChange",
        "DailyUsdcPriceChange",
        "DailyUsdpPriceChange",
        "Forecast",
        "PaymentsOffChainIncluded",
        "PaymentsOnChain",
        "ProtocolNetOutflow",
      ];
    },
    dimensions: async (_: any, { filter }: any, { dataSources }: any) => {
      const queryEngine: AnalyticsModel = dataSources.db.Analytics;
      return await queryEngine.getDimensions();
    },
    currencies: async (_: any, { filter }: any, { dataSources }: any) => {
      return ["DAI", "FTE", "GUSD", "MKR", "USDC", "USDP", "USDT"];
    },
    multiCurrencySeries: async (
      _: any,
      { filter }: any,
      { dataSources }: any,
    ) => {
      const queryEngine: AnalyticsModel = dataSources.db.Analytics;
      const results = await queryEngine.multiCurrencyQuery(filter);

      return results.map((s) => ({
        ...s,
        rows: s.rows.map((r: any) => ({
          ...r,
          dimensions: Object.keys(r.dimensions).map((d) => ({
            name: d,
            path: r.dimensions[d]["path"],
            icon: r.dimensions[d]["icon"],
            label: r.dimensions[d]["label"],
            description: r.dimensions[d]["description"],
          })),
        })),
      }));
    },
  },
};
