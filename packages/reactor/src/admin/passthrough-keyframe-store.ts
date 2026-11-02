import type { IKeyframeStore } from "../storage/interfaces.js";

export const passthroughKeyframeStore: IKeyframeStore = {
  putKeyframe: () => Promise.resolve(),
  putKeyframeAndPrune: () => Promise.resolve(),
  findNearestKeyframe: () => Promise.resolve(undefined),
  listKeyframes: () => Promise.resolve([]),
  deleteKeyframes: () => Promise.resolve(0),
};
