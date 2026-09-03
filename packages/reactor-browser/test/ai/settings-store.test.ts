import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAiSettings,
  DEFAULT_AI_SETTINGS,
  getAiSettings,
  isAiConfigured,
  subscribeAiSettings,
  updateAiSettings,
} from "../../src/ai/settings-store.js";

const STORAGE_KEY = "ph-ai-chat-settings";

describe("ai settings store", () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    clearAiSettings();
  });

  it("returns defaults when nothing is stored", () => {
    expect(getAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("persists updates to localStorage and returns the merged value", () => {
    const next = updateAiSettings({ baseUrl: "https://api.example.com/v1" });
    expect(next).toMatchObject({ baseUrl: "https://api.example.com/v1" });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as {
      baseUrl: string;
      autoApproveWrites: boolean;
    };
    expect(stored.baseUrl).toBe("https://api.example.com/v1");
    expect(stored.autoApproveWrites).toBe(false);
  });

  it("returns a stable snapshot until the next update", () => {
    const a = getAiSettings();
    const b = getAiSettings();
    expect(a).toBe(b);
    updateAiSettings({ model: "gpt-test" });
    expect(getAiSettings()).not.toBe(a);
  });

  it("notifies subscribers on update and clear", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAiSettings(listener);
    updateAiSettings({ apiKey: "k" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    updateAiSettings({ apiKey: "k2" });
    expect(listener).toHaveBeenCalledTimes(1);
    clearAiSettings();
    expect(getAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("ignores malformed stored payloads", () => {
    localStorage.setItem(STORAGE_KEY, "{not-json");
    clearAiSettings();
    updateAiSettings({ model: "m" });
    expect(getAiSettings()).toMatchObject({ model: "m" });
  });

  it("reports configured only when url, key and model are all set", () => {
    expect(isAiConfigured(getAiSettings())).toBe(false);
    updateAiSettings({ baseUrl: "https://x", apiKey: "k" });
    expect(isAiConfigured(getAiSettings())).toBe(false);
    updateAiSettings({ model: "m" });
    expect(isAiConfigured(getAiSettings())).toBe(true);
  });
});
