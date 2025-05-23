import clsx from "clsx";
import Heading from "@theme/Heading";
import Link from "@docusaurus/Link";
import React from "react";
import styles from "./styles.module.css";

type FeatureItem = {
  title: string;
  imageSrc: string;
  docPath: string;
  description: React.ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: "Connect",
    imageSrc: require("@site/static/img/connect.png").default,
    docPath: "docs/academy/Architecture/PowerhouseArchitecture",
    description: (
      <>
        Learn about the private contributor tool Connect
      </>
    ),
  },
  {
    title: "Switchboard",
    imageSrc: require("@site/static/img/switchboard.png").default,
    docPath: "/docs/academy/AdvancedTutorial/WorkWithData/ReadingAndWritingThroughTheAPI",
    description: <>Get access to the open API interface with Switchboard</>,
  },
  {
    title: "Fusion",
    imageSrc: require("@site/static/img/fusion.png").default,
    docPath: "docs/academy/Architecture/PowerhouseArchitecture",
    description: (
      <>
        Setup Fusion as your organizations dashboard
      </>
    ),
  },
  {
    title: "Renown",
    imageSrc: require("@site/static/img/renown.png").default,
    docPath: "/docs/renown/intro",
    description: (
      <>
        Dive into the customizable reputation system 
      </>
    ),
  },
  {
    title: "Reactor",
    imageSrc: require("@site/static/img/reactor.png").default,
    docPath: "/docs/academy/Architecture/WorkingWithTheReactor",
    description: (
      <>Find out how a Powerhouse Reactor node works</>
    ),
  },
];

function Feature({ title, imageSrc, description, docPath }: FeatureItem) {
  return (
    <div className={styles.col}>
      <Link to={docPath} className={styles.featureLink}>
        <div className={styles.featureContent}>
          <div className={styles.featureImageWrapper}>
            <img src={imageSrc} alt={title} className={styles.featureImage} />
          </div>
          <div className={styles.featureText}>
            <Heading as="h4" className={styles.featureTitle}>{title}</Heading>
            <p className={styles.featureDescription}>{description}</p>
          </div>
        </div>
      </Link>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className={styles.featuresWrapper}>
        {/* Learning Path Cards */}
        <div className={styles.learningPath}>
          {/* Get Started Card - Full Width */}
          <div className={`${styles.pathCard} ${styles.fullWidth}`}>
            <div className={styles.cardHeader} style={{ justifyContent: 'center' }}>
              <div className={styles.cardIconWrapper}>
                <img src="/img/academy/icons/Flash.svg" alt="" />
              </div>
              <h3 className={styles.cardTitle}>Get started</h3>
            </div>
            <div className={styles.cardContent}>
              <div style={{ maxWidth: '960px', margin: '0 auto', textAlign: 'center' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}><strong>Welcome to Powerhouse!</strong></p>
                  <p style={{ lineHeight: '1.6', color: '#444' }}>As a developer, you're about to dive into a <strong>unique ecosystem built to empower decentralized organizations</strong>. Powerhouse provides the software, infrastructure, and frameworks that enable scalable network organizations to operate efficiently.</p>
                </div>
                <div style={{ margin: '20px 0', textAlign: 'center' }}>
                   <iframe
                     src="https://drive.google.com/file/d/17dDKy-hQeI4ZlLiUZ4xhnXL4bDhJB0N-/preview"
                     frameBorder="0"
                     allow="autoplay; fullscreen"
                     allowFullScreen
                     title="Powerhouse Introduction Video"
                     style={{
                       width: '100%',
                       maxWidth: '960px',
                       aspectRatio: '16 / 9',
                       borderRadius: '8px',
                       display: 'block',
                       margin: '0 auto'
                     }}
                   ></iframe>
                </div>
              </div>
            </div>
          </div>

          {/* Create Cards - One in each column */}
          <div className={styles.pathCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrapper}>
                <img src="/img/academy/icons/Book.svg" alt="" />
              </div>
              <h3 className={styles.cardTitle}>Book of Powerhouse</h3>
            </div>
            <div className={styles.cardContent}>
              <a href="/docs/bookofpowerhouse/Overview" className={styles.pathButton}>The Vision of Powerhouse</a>
            </div>
          </div>

          <div className={styles.pathCard} style={{ border: '1px solid #4FC86F' }}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrapper}>
                <img src="/img/academy/icons/Create.svg" alt="" />
              </div>
              <h3 className={styles.cardTitle}>Create</h3>
            </div>
            <div className={styles.cardContent}>
              <a href="/docs/academy/GetStarted/ToDoList/CreateNewPowerhouseProject" className={styles.pathButton}>Build a Todo-list Document Model</a>
            </div>
          </div>

          <div className={styles.pathCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrapper}>
                <img src="/img/academy/icons/Advanced.svg" alt="" />
              </div>
              <h3 className={styles.cardTitle}>Document Model Theory</h3>
            </div>
            <div className={styles.cardContent}>
              <a href="/docs/academy/GetStarted/DocumentModelTheory/WhatIsADocumentModel" className={styles.pathButton}>Deep Dive into Document Modelling</a>
            </div>
          </div>

          {/* Left Column Card with 2 buttons */}
          <div className={styles.pathCard} style={{ border: '1px solid #4FC86F' }}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrapper}>
                <img src="/img/academy/icons/Editor.svg" alt="" />
              </div>
              <h3 className={styles.cardTitle}>Build User Experiences</h3>
            </div>
            <div className={styles.cardContent}>
              <a href="/docs/academy/GetStarted/ToDoList/BuildToDoListEditor" className={styles.pathButton}>Building a Todo-list Editor</a>
              <a href="/docs/academy/BuildingUserExperiences/BuildingBeautifulDocumentEditors" className={styles.pathButton}>Building Beautiful Document Editors</a>
              <a href="/docs/academy/AdvancedTutorial/BuildingUserExperiences/BuildingADriveExplorer" className={styles.pathButton}>Building Custom Drive Explorers</a>
            </div>
          </div>

          {/* Middle column with Union.svg */}
          <div className={styles.middleColumn} style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'flex-start', 
            paddingTop: '-20px',
            position: 'relative'
          }}>
            <img src="/img/Union.svg" alt="Powerhouse Union" width="250" />
            <div style={{ 
              position: 'absolute',
              top: '18px',
              backgroundColor: 'white', 
              padding: '8px 16px', 
              borderRadius: '8px',
              textAlign: 'center',
              zIndex: 2,
            }}>
              <h3 className={styles.cardTitle} style={{ margin: 0 }}>Builder Track</h3>
            </div>
          </div>

          {/* Right Column Card with 3 buttons */}
          <div className={styles.pathCard} style={{ border: '1px solid #4FC86F' }}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrapper}>
                <img src="/img/academy/icons/Data.svg" alt="" />
              </div>
              <h3 className={styles.cardTitle}>Work with Data</h3>
            </div>
            <div className={styles.cardContent}>
              <a href="//docs/academy/AdvancedTutorial/WorkWithData/ReadingAndWritingThroughTheAPI" className={styles.pathButton}>Reading & Writing through the API</a>
              <a href="/docs/academy/AdvancedTutorial/WorkWithData/WorkingWithSubgraphs" className={styles.pathButton}>Create your own Subgraph</a>
              <a href="/docs/academy/WorkWithData/Analytics Engine/intro" className={styles.pathButton}>Using the Analytics Engine</a>
            </div>
          </div>

          {/* Launch Card - Full Width with 3 column buttons */}
          <div className={`${styles.pathCard} ${styles.fullWidth}`}>
            <div className={styles.cardHeader} style={{ justifyContent: 'center' }}>
              <div className={styles.cardIconWrapper}>
                <img src="/img/academy/icons/Launch.svg" alt="" />
              </div>
              <h3 className={styles.cardTitle}>Launch</h3>
            </div>
            <div className={styles.cardContent}>
              <div className={styles.buttonContainer}>
                <a href="/docs/academy/AdvancedTutorial/Launch/PublishYourProject" className={styles.pathButton}>Package & Publish</a>
                <a href="/docs/academy/Launch/LaunchYourBackend" className={styles.pathButton}>Launch Back-end</a>
                <a href="/docs/academy/Launch/LaunchYourFrontend" className={styles.pathButton}>Launch Front-end</a>
              </div>
            </div>
          </div>
        </div>
        {/* Existing Features Section */}
        <h2 className={styles.sectionTitle}>Browse by host-application</h2>
        <div className={styles.row}>
          {FeatureList.map((props, idx) => {
            return (
              <div key={idx} className={styles.col}>
                <Link to={props.docPath} className={styles.featureLink}>
                  <div className={styles.featureContent}>
                    <div className={styles.featureImageWrapper}>
                      <img src={props.imageSrc} alt={props.title} className={styles.featureImage} />
                    </div>
                    <div className={styles.featureText}>
                      <Heading as="h4" className={styles.featureTitle}>{props.title}</Heading>
                      <p className={styles.featureDescription}>{props.description}</p>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
