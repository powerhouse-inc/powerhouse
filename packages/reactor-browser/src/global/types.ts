import { type IPowerhouseAnalytics } from "../analytics/types.js";

export interface PowerhouseGlobal {
  analytics?: IPowerhouseAnalytics;
}

declare global {
  interface Window {
    powerhouse?: PowerhouseGlobal;
  }
}
