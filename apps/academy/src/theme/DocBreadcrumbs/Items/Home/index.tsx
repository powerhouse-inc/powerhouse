import React from "react";
import type { JSX } from "react";
import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import { translate } from "@docusaurus/Translate";
import { useActivePlugin } from "@docusaurus/plugin-content-docs/client";
import IconHome from "@theme/Icon/Home";
import styles from "./styles.module.css";

/** Docs plugins that are their own section get a crumb back to its start. */
const SECTION_LABELS: Record<string, string> = { learn: "Learn" };

export default function HomeBreadcrumbItem(): JSX.Element {
  const homeHref = useBaseUrl("/");
  const activePlugin = useActivePlugin();
  const sectionLabel = activePlugin && SECTION_LABELS[activePlugin.pluginId];

  return (
    <>
      <li className="breadcrumbs__item">
        <Link
          aria-label={translate({
            id: "theme.docs.breadcrumbs.home",
            message: "Home page",
            description: "The ARIA label for the home page in the breadcrumbs",
          })}
          className="breadcrumbs__link"
          href={homeHref}
        >
          <IconHome className={styles.breadcrumbHomeIcon} />
        </Link>
      </li>
      {sectionLabel && (
        <li className="breadcrumbs__item">
          <Link
            className="breadcrumbs__link"
            href={activePlugin.pluginData.path}
          >
            {sectionLabel}
          </Link>
        </li>
      )}
    </>
  );
}
