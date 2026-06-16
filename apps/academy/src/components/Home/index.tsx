import React from "react";
import type { JSX } from "react";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import styles from "./styles.module.css";

const steps = [
  { n: "1", label: "Install the CLI", code: "pnpm install -g ph-cmd" },
  { n: "2", label: "Launch the agent", code: "ph vetra --watch" },
  {
    n: "3",
    label: "Describe what you want",
    code: '"Build a task tracker with…"',
  },
];

type Lane = {
  tag: string;
  title: string;
  blurb: string;
  href: string;
  cta: string;
};

const lanes: Lane[] = [
  {
    tag: "Do it",
    title: "Get started",
    blurb:
      "Build your first package by talking to the Vetra Studio Agent — from zero to a working model, editor, and code.",
    href: "/academy/GetStarted/VetraStudio",
    cta: "Start building",
  },
  {
    tag: "Understand it",
    title: "Learn",
    blurb:
      "First principles — what a document model is, why event sourcing, and how to read what the agent generates for you.",
    href: "/learn",
    cta: "Learn the concepts",
  },
  {
    tag: "Go deeper",
    title: "Build by hand",
    blurb:
      "Under the hood — the manual workflows for debugging, extending, and contributing when you need to go beyond the agent.",
    href: "/academy/MasteryTrack/ManualTodoTutorial/CreateNewPowerhouseProject",
    cta: "Build manually",
  },
];

const reference = [
  { label: "CLI reference", href: "/academy/Reference/APIReferences/PowerhouseCLI" },
  { label: "API references", href: "/academy/Reference/APIReferences/ReactHooks" },
  { label: "Cookbook & recipes", href: "/academy/Reference/Cookbook" },
  { label: "Component library", href: "/academy/Reference/ComponentLibrary/DocumentEngineering" },
  { label: "Architecture", href: "/academy/Architecture/PowerhouseArchitecture" },
];

const buildWith = [
  { label: "Explore use-cases", href: "/academy/MasteryTrack/ExampleUsecases/Overview" },
  { label: "Reactor recipes", href: "/academy/Reference/Cookbook#reactor-recipes" },
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
          ecosystem. Spec-driven and AI-native — create open-source,
          decentralized back-ends for any SaaS, ERP, CMS, or CRM.
        </p>
        <div className={styles.heroButtons}>
          <Link
            className="button button--primary button--lg"
            to="/academy/GetStarted/VetraStudio"
          >
            Start building →
          </Link>
          <Link className="button button--secondary button--lg" to="#intro">
            ▶ Watch the 2-min intro
          </Link>
        </div>
      </header>

      <section className={styles.steps}>
        {steps.map((s) => (
          <div key={s.n} className={styles.step}>
            <span className={styles.stepNumber}>{s.n}</span>
            <div>
              <div className={styles.stepLabel}>{s.label}</div>
              <code className={styles.stepCode}>{s.code}</code>
            </div>
          </div>
        ))}
      </section>

      <section className={styles.lanes}>
        {lanes.map((lane) => (
          <Link key={lane.title} to={lane.href} className={styles.lane}>
            <span className={styles.laneTag}>{lane.tag}</span>
            <Heading as="h2" className={styles.laneTitle}>
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

      <section className={styles.strips}>
        <div className={styles.strip}>
          <span className={styles.stripLabel}>Reference</span>
          <div className={styles.stripLinks}>
            {reference.map((r) => (
              <Link key={r.href} to={r.href} className={styles.stripLink}>
                {r.label}
              </Link>
            ))}
          </div>
        </div>
        <div className={styles.strip}>
          <span className={styles.stripLabel}>See what you can build</span>
          <div className={styles.stripLinks}>
            {buildWith.map((b) => (
              <Link key={b.href} to={b.href} className={styles.stripLink}>
                {b.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
