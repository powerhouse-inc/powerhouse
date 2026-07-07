import React, { useState } from "react";
import type { JSX } from "react";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import styles from "./styles.module.css";

const steps = [
  { n: "1", label: "Install the CLI", code: "pnpm install -g ph-cmd" },
  { n: "2", label: "Launch the agent", code: "curl -fsSL https://get.vetra.io | sh" },
  {
    n: "3",
    label: "Describe what you want",
    code: '"Build a task tracker with…"',
  },
];

/* Inline Lucide icons (lucide.dev) — no dependency, currentColor stroke. */
type IconProps = { className?: string };
const svgBase = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function ZapIcon(p: IconProps) {
  return (
    <svg {...svgBase} {...p}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function BookOpenIcon(p: IconProps) {
  return (
    <svg {...svgBase} {...p}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function WrenchIcon(p: IconProps) {
  return (
    <svg {...svgBase} {...p}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function CopyIcon(p: IconProps) {
  return (
    <svg {...svgBase} width={16} height={16} {...p}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon(p: IconProps) {
  return (
    <svg {...svgBase} width={16} height={16} {...p}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function StepCode({ code }: { code: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      className={styles.stepCode}
      onClick={handleCopy}
      title="Copy to clipboard"
      aria-label={copied ? "Copied" : `Copy "${code}"`}
    >
      <code className={styles.stepCodeText}>{code}</code>
      {copied ? (
        <CheckIcon className={styles.stepCodeIcon} />
      ) : (
        <CopyIcon className={styles.stepCodeIcon} />
      )}
    </button>
  );
}

type Lane = {
  Icon: (p: IconProps) => JSX.Element;
  tag: string;
  title: string;
  blurb: string;
  href: string;
  cta: string;
};

const lanes: Lane[] = [
  {
    Icon: ZapIcon,
    tag: "Do it",
    title: "Get started",
    blurb:
      "Build your first package by talking to the Vetra Studio Agent — from zero to a working model, editor, and code.",
    href: "/academy/GetStarted/VetraStudio",
    cta: "Start building",
  },
  {
    Icon: BookOpenIcon,
    tag: "Understand it",
    title: "Learn",
    blurb:
      "First principles — what a document model is, why event sourcing, and how to read what the agent generates for you.",
    href: "/learn",
    cta: "Learn the concepts",
  },
  {
    Icon: WrenchIcon,
    tag: "Go deeper",
    title: "Build by hand",
    blurb:
      "Under the hood — the manual workflows for debugging, extending, and contributing when you need to go beyond the agent.",
    href: "/academy/Build/ManualTodoTutorial/CreateNewPowerhouseProject",
    cta: "Build manually",
  },
];

export default function Home(): JSX.Element {
  return (
    <div className={styles.home}>
      <header className={styles.hero}>
        <Heading as="h1" className={styles.heroTitle}>
          Build decentralized back-ends by describing them to an agent.
        </Heading>
        <p className={styles.heroSubtitle}>
          Vetra is the agent-first builder platform for the Powerhouse
          ecosystem.
          <br />
          Spec-driven and AI-native — create open-source, decentralized
          back-ends for any SaaS, ERP, CMS, or CRM.
        </p>
        <div className={styles.heroButtons}>
          <Link
            className="button button--primary button--lg"
            to="/academy/GetStarted/VetraStudio"
          >
            Start building →
          </Link>
          <Link
            className={`button button--secondary button--lg ${styles.introBtn}`}
            to="#intro"
          >
            ▶ Watch the 2-min intro
          </Link>
        </div>
      </header>

      <Heading as="h2" className={styles.stepsTitle}>
        Run it locally with your own key
      </Heading>
      <section className={styles.steps}>
        {steps.map((s) => (
          <div key={s.n} className={styles.step}>
            <span className={styles.stepNumber}>{s.n}</span>
            <div>
              <div className={styles.stepLabel}>{s.label}</div>
              <StepCode code={s.code} />
            </div>
          </div>
        ))}
      </section>

      <hr className={styles.divider} />

      <Heading as="h2" className={styles.stepsTitle}>
        From prompt to source code
      </Heading>
      <section className={styles.lanes}>
        {lanes.map((lane) => (
          <Link key={lane.title} to={lane.href} className={styles.lane}>
            <span className={styles.laneTag}>{lane.tag}</span>
            <Heading as="h2" className={styles.laneTitle}>
              <lane.Icon className={styles.laneTitleIcon} />
              {lane.title}
            </Heading>
            <p className={styles.laneBlurb}>{lane.blurb}</p>
            <span className={styles.laneCta}>{lane.cta} →</span>
          </Link>
        ))}
      </section>

      <section id="intro" className={styles.intro}>
        <div className={styles.videoWrap}>
          <iframe
            className={styles.video}
            src="https://www.youtube.com/embed/wCrUgPrMtak"
            title="Powerhouse introduction"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </section>
    </div>
  );
}
