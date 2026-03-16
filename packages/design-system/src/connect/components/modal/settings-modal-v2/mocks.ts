import type { RegistryPackage } from "@powerhousedao/shared/registry";

export const mockPackages: RegistryPackage[] = [
  {
    name: "@uniswap/lp-tools",
    documentTypes: ["@uniswap/lp-tools"],
    path: "/stub-path",
    status: "available",
    manifest: {
      name: "LP Management Tools",
      description:
        "Tools for managing liquidity positions across multiple AMMs with impermanent loss tracking.",
      category: "DeFi",
      publisher: {
        name: "@uniswap",
        url: "https://uniswap.org/",
      },
    },
  },
  {
    name: "@chainlink/oracle-integrations",
    documentTypes: ["@chainlink/oracle-integrations"],
    path: "/stub-path",
    status: "available",
    manifest: {
      name: "Oracle Integration Pack",
      description:
        "Seamless integration with Chainlink oracles for price feeds and external data.",
      category: "Infrastructure",
      publisher: {
        name: "@chainlink",
        url: "https://chain.link/",
      },
    },
  },
  {
    name: "@sky-ph/rwa",
    documentTypes: ["@sky-ph/rwa"],
    path: "/stub-path",
    status: "available",
    manifest: {
      name: "RWA Reporting Package",
      description:
        "The real world assets portfolio reporting package for the sky ecosystem.",
      category: "Finance",
      publisher: {
        name: "@powerhousedao",
        url: "https://www.powerhouse.inc/",
      },
    },
  },
  {
    name: "@powerhousedao/builder-tools",
    documentTypes: ["@powerhousedao/builder-tools"],
    path: "/stub-path",
    status: "available",
    manifest: {
      name: "Builder Tooling",
      description:
        "The real world assets portfolio reporting package for the sky ecosystem.",
      category: "Finance",
      publisher: {
        name: "@powerhousedao",
        url: "https://www.powerhouse.inc/",
      },
    },
  },
  {
    name: "@makerdao/governance-toolkit",
    documentTypes: ["@makerdao/governance-toolkit"],
    path: "/stub-path",
    status: "available",
    manifest: {
      name: "Governance Toolkit",
      description:
        "A comprehensive toolkit for managing decentralized governance proposals, voting, and delegation.",
      category: "Governance",
      publisher: {
        name: "@makerdao",
        url: "https://makerdao.com/",
      },
    },
  },
  {
    name: "@aave/lending-analytics",
    documentTypes: ["@aave/lending-analytics"],
    path: "/stub-path",
    status: "available",
    manifest: {
      name: "Lending Analytics Suite",
      description:
        "Advanced analytics and reporting tools for DeFi lending protocols with real-time monitoring.",
      category: "DeFi",
      publisher: {
        name: "@aave",
        url: "https://aave.com/",
      },
    },
  },
  {
    name: "@compound/treasury-manager",
    documentTypes: ["@compound/treasury-manager"],
    path: "/stub-path",
    status: "available",
    manifest: {
      name: "Treasury Manager",
      description:
        "Streamlined treasury management for DAOs with multi-sig support and spending proposals.",
      category: "Finance",
      publisher: {
        name: "@compound",
        url: "https://compound.finance/",
      },
    },
  },
  {
    name: "@openzeppelin/security-suite",
    documentTypes: ["@openzeppelin/security-suite"],
    path: "/stub-path",
    status: "available",
    manifest: {
      name: "Security Audit Suite",
      description:
        "Automated security scanning and vulnerability detection for smart contracts.",
      category: "Security",
      publisher: {
        name: "@openzeppelin",
        url: "https://openzeppelin.com/",
      },
    },
  },
  {
    name: "@ens/domain-manager",
    documentTypes: ["@ens/domain-manager"],
    path: "/stub-path",
    status: "available",
    manifest: {
      name: "ENS Domain Manager",
      description:
        "Manage ENS domains, subdomains, and records with an intuitive interface.",
      category: "Identity",
      publisher: {
        name: "@ens",
        url: "https://ens.domains/",
      },
    },
  },
  {
    name: "@gnosis/safe-extensions",
    documentTypes: ["@gnosis/safe-extensions"],
    path: "/stub-path",
    status: "available",
    manifest: {
      name: "Safe Extensions Pack",
      description:
        "Extended functionality for Gnosis Safe including batch transactions and recurring payments.",
      category: "Wallets",
      publisher: {
        name: "@gnosis",
        url: "https://gnosis-safe.io/",
      },
    },
  },
];

export const mockDocumentModelEditorOptions = [
  { label: "V1", value: "document-model-editor" },
  { label: "V2", value: "document-model-editor-v2" },
];
