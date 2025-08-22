import type { PowerhouseGlobal } from "./types.js";

export function getGlobal<K extends keyof PowerhouseGlobal>(
  namespace: K,
): PowerhouseGlobal[K] | undefined {
  if (typeof window === "undefined") return undefined;
  return window.powerhouse?.[namespace];
}

export function setGlobal<K extends keyof PowerhouseGlobal>(
  namespace: K,
  value: PowerhouseGlobal[K],
): void {
  if (typeof window === "undefined") return;
  window.powerhouse = window.powerhouse || {};
  window.powerhouse[namespace] = value;
}

export function clearGlobal(namespace: keyof PowerhouseGlobal): void {
  if (typeof window === "undefined") return;

  if (window.powerhouse?.[namespace]) {
    delete window.powerhouse[namespace];
    if (Object.keys(window.powerhouse).length === 0) {
      delete window.powerhouse;
    }
  }
}
