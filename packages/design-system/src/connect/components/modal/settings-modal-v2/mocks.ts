export const mockReactorOptions = [
  {
    label: "Local Reactor",
    value: "local-reactor",
  },
  {
    label: "Switchboard",
    value: "switchboard",
  },
];

export const mockPackages = [
  {
    id: "@sky-ph/rwa",
    name: "RWA Reporting Package",
    description:
      "The real world assets portfolio reporting package for the sky ecosystem.",
    category: "Finance",
    publisher: "@powerhousedao",
    publisherUrl: "https://www.powerhouse.inc/",
    modules: [
      "Analytics Processor (Switchboard)",
      "RWA Portfolio Report Document Model (Connect)",
      "RWA Portfolio Report Editor (Connect)",
    ],
    removable: true,
  },
  {
    id: "@powerhousedao/builder-tools",
    name: "Builder Tooling",
    description:
      "The real world assets portfolio reporting package for the sky ecosystem.",
    category: "Finance",
    publisher: "@powerhousedao",
    publisherUrl: "https://www.powerhouse.inc/",
    modules: [
      "Analytics Processor (Switchboard)",
      "RWA Portfolio Report Document Model (Connect)",
      "RWA Portfolio Report Editor (Connect)",
    ],
    removable: true,
  },
  {
    id: "@makerdao/governance-toolkit",
    name: "Governance Toolkit",
    description:
      "A comprehensive toolkit for managing decentralized governance proposals, voting, and delegation.",
    category: "Governance",
    publisher: "@makerdao",
    publisherUrl: "https://makerdao.com/",
    modules: [
      "Proposal Manager (Connect)",
      "Voting Dashboard (Connect)",
      "Delegation Tracker (Switchboard)",
    ],
    removable: true,
  },
  {
    id: "@aave/lending-analytics",
    name: "Lending Analytics Suite",
    description:
      "Advanced analytics and reporting tools for DeFi lending protocols with real-time monitoring.",
    category: "DeFi",
    publisher: "@aave",
    publisherUrl: "https://aave.com/",
    modules: [
      "Liquidity Monitor (Switchboard)",
      "Interest Rate Tracker (Connect)",
      "Risk Assessment Dashboard (Connect)",
      "Collateral Analyzer (Connect)",
    ],
    removable: true,
  },
  {
    id: "@compound/treasury-manager",
    name: "Treasury Manager",
    description:
      "Streamlined treasury management for DAOs with multi-sig support and spending proposals.",
    category: "Finance",
    publisher: "@compound",
    publisherUrl: "https://compound.finance/",
    modules: ["Multi-Sig Wallet (Connect)", "Budget Tracker (Connect)"],
    removable: true,
  },
  {
    id: "@uniswap/lp-tools",
    name: "LP Management Tools",
    description:
      "Tools for managing liquidity positions across multiple AMMs with impermanent loss tracking.",
    category: "DeFi",
    publisher: "@uniswap",
    publisherUrl: "https://uniswap.org/",
    modules: [
      "Position Manager (Connect)",
      "IL Calculator (Connect)",
      "Fee Analytics (Switchboard)",
      "Range Order Editor (Connect)",
      "Pool Explorer (Connect)",
    ],
    removable: false,
  },
  {
    id: "@chainlink/oracle-integrations",
    name: "Oracle Integration Pack",
    description:
      "Seamless integration with Chainlink oracles for price feeds and external data.",
    category: "Infrastructure",
    publisher: "@chainlink",
    publisherUrl: "https://chain.link/",
    modules: [
      "Price Feed Connector (Switchboard)",
      "Data Aggregator (Switchboard)",
    ],
    removable: true,
  },
  {
    id: "@openzeppelin/security-suite",
    name: "Security Audit Suite",
    description:
      "Automated security scanning and vulnerability detection for smart contracts.",
    category: "Security",
    publisher: "@openzeppelin",
    publisherUrl: "https://openzeppelin.com/",
    modules: [
      "Contract Scanner (Connect)",
      "Vulnerability Report Generator (Connect)",
      "Audit Trail Logger (Switchboard)",
    ],
    removable: true,
  },
  {
    id: "@ens/domain-manager",
    name: "ENS Domain Manager",
    description:
      "Manage ENS domains, subdomains, and records with an intuitive interface.",
    category: "Identity",
    publisher: "@ens",
    publisherUrl: "https://ens.domains/",
    modules: ["Domain Registry (Connect)", "Record Editor (Connect)"],
    removable: true,
  },
  {
    id: "@gnosis/safe-extensions",
    name: "Safe Extensions Pack",
    description:
      "Extended functionality for Gnosis Safe including batch transactions and recurring payments.",
    category: "Wallets",
    publisher: "@gnosis",
    publisherUrl: "https://gnosis-safe.io/",
    modules: [
      "Batch Transaction Builder (Connect)",
      "Recurring Payments (Switchboard)",
      "Spending Limits (Connect)",
      "Transaction History (Connect)",
    ],
    removable: true,
  },
];

export const mockDocumentModelEditorOptions = [
  { label: "V1", value: "document-model-editor" },
  { label: "V2", value: "document-model-editor-v2" },
];
