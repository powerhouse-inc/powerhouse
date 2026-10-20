import {
  useLinkProps,
  usePHNavigation,
  useTheme,
} from "@powerhousedao/reactor-browser";
import { Outlet } from "@tanstack/react-router";
import { Suspense } from "react";
import type { SettingsTabEntry } from "../router/settings.js";
import { useSettingsTabs } from "../router/settings.js";

function TabLink({ tab }: { tab: SettingsTabEntry }) {
  const link = useLinkProps({ settings: tab.id });
  const current = link["aria-current"] === "page";
  const Icon = tab.icon;
  return (
    <a
      {...link}
      className={[
        "flex items-center gap-2 rounded px-3 py-1.5",
        current ? "bg-core-hover font-semibold" : "hover:bg-core-hover",
        tab.destructive ? "text-core-danger" : "text-core-fg",
      ].join(" ")}
    >
      {Icon && <Icon size={16} />}
      {tab.label}
    </a>
  );
}

/** Core's settings page: the tabs from `staticData.settings` beside the open one. */
export function CoreSettingsPage() {
  const tabs = useSettingsTabs();
  const navigation = usePHNavigation();
  // Back to where settings was opened from, else home.
  const close = () => {
    if (navigation.closeOpened?.()) return;
    navigation.open(undefined, { replace: true });
  };
  return (
    <div className="flex h-full flex-col text-core-fg">
      <div className="flex items-center justify-between border-b border-core-border px-4 py-3">
        <h1 className="text-lg font-semibold">Settings</h1>
        <button
          type="button"
          className="rounded px-2 text-core-muted hover:bg-core-hover"
          onClick={close}
        >
          Close
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Settings" className="w-48 shrink-0 p-3">
          <ul className="flex flex-col gap-1">
            {tabs.map((tab) => (
              <li key={tab.id}>
                <TabLink tab={tab} />
              </li>
            ))}
          </ul>
        </nav>
        <section className="min-w-0 flex-1 overflow-auto p-6">
          <Suspense name="SettingsTab">
            <Outlet />
          </Suspense>
        </section>
      </div>
    </div>
  );
}

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

/** Core's Appearance tab: light, dark, or the system's. */
export function AppearanceTab() {
  const { theme, isSystem, setTheme } = useTheme();
  const selected = isSystem ? "system" : theme;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold">Theme</legend>
      {THEMES.map((option) => (
        <label key={option.value} className="flex items-center gap-2">
          <input
            type="radio"
            name="theme"
            value={option.value}
            checked={selected === option.value}
            onChange={() => setTheme(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
