import { Icon } from "@powerhousedao/design-system";
import { ThemeSwitch } from "@powerhousedao/design-system/connect";
import { useLinkProps, usePHNavigation } from "@powerhousedao/reactor-browser";
import { Outlet } from "@tanstack/react-router";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { twMerge } from "tailwind-merge";
import type { SettingsTabEntry } from "../../router/settings.js";
import { useSettingsTabs } from "../../router/settings.js";

function SettingsTabLink({ tab }: { tab: SettingsTabEntry }) {
  const link = useLinkProps({ settings: tab.id });
  const TabIcon = tab.icon;
  const current = link["aria-current"] === "page";
  return (
    <a
      {...link}
      className={twMerge(
        "flex h-9 w-48 items-center gap-x-2 rounded-md pl-3 text-left text-foreground",
        current ? "cursor-default bg-accent" : "hover:bg-accent",
        tab.destructive && "text-destructive",
      )}
    >
      {TabIcon && (
        <TabIcon
          size={16}
          className={tab.destructive ? "text-destructive" : undefined}
        />
      )}
      <span>{tab.label}</span>
    </a>
  );
}

/** The settings page: its tabs as links beside the open one. */
export function SettingsPage() {
  const { t } = useTranslation();
  const tabs = useSettingsTabs();
  const navigation = usePHNavigation();
  // Back to where settings was opened from, else home.
  const close = () => {
    if (navigation.closeOpened?.()) return;
    navigation.open(undefined, { replace: true });
  };
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h1 className="text-xl font-semibold text-foreground">
          {t("modals.connectSettings.title")}
        </h1>
        <button
          type="button"
          aria-label="Close"
          className="flex size-6 cursor-pointer items-center justify-center rounded-md text-foreground outline-none"
          onClick={close}
        >
          <Icon name="XmarkLight" size={24} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Settings" className="flex flex-col p-3 pt-6">
          <div className="flex flex-col gap-y-1">
            {tabs.map((tab) => (
              <SettingsTabLink key={tab.id} tab={tab} />
            ))}
          </div>
          <div className="mt-auto border-t border-border pt-2">
            <ThemeSwitch horizontal />
          </div>
        </nav>
        <main className="m-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
          <Suspense name="SettingsTab">
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
