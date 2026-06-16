import React from "react";
import type { JSX } from "react";
import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import styles from "./styles.module.css";

/**
 * Navbar brand, matching the Vetra styleguide header: the icon and the wordmark
 * are separate images at a 3:2 size ratio (styleguide uses icon@36 / wordmark@24),
 * so the icon reads larger than the wordmark. Wordmark colorway swaps with theme.
 */
export default function NavbarLogo(): JSX.Element {
  return (
    <Link to="/" className={`navbar__brand ${styles.brand}`} aria-label="Vetra">
      <img
        src={useBaseUrl("/img/vetra-icon.svg")}
        alt=""
        className={styles.icon}
      />
      <img
        src={useBaseUrl("/img/vetra-logo-light-text.svg")}
        alt="Vetra"
        className={`${styles.wordmark} ${styles.wordmarkLight}`}
      />
      <img
        src={useBaseUrl("/img/vetra-logo-dark-text.svg")}
        alt="Vetra"
        className={`${styles.wordmark} ${styles.wordmarkDark}`}
      />
    </Link>
  );
}
