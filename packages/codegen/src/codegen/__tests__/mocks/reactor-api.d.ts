declare module "@powerhousedao/reactor-api" {
  export interface Subgraph {
    [key: string]: any;
  }
  
  export class AnalyticsPath {
    static fromString(path: string): AnalyticsPath;
    [key: string]: any;
  }
  
  export interface AnalyticsSeriesInput {
    [key: string]: any;
  }
  
  export interface IAnalyticsStore {
    addSeriesValues(inputs: AnalyticsSeriesInput[]): Promise<void>;
    [key: string]: any;
  }
}