/**
 * Learn-section course structure (prototype).
 *
 * Curated view over the existing `docs/academy/02-MasteryTrack` content — no
 * content is duplicated. Lesson `id`s are Docusaurus doc IDs (numeric folder
 * prefixes like `01-` are stripped by Docusaurus to form the id/permalink).
 * With `routeBasePath: "/"`, a doc's URL is simply `/<id>`.
 */

export type Lesson = {
  /** Docusaurus doc id, e.g. "academy/MasteryTrack/BuilderEnvironment/Prerequisites" */
  id: string;
  title: string;
};

export type Module = {
  key: string;
  title: string;
  description: string;
  lessons: Lesson[];
};

const BASE = "academy/MasteryTrack";

export const modules: Module[] = [
  {
    key: "get-started",
    title: "Get started (agent-first)",
    description:
      "Set up Vetra Studio and build your first package by talking to the agent.",
    lessons: [
      { id: `academy/GetStarted/VetraStudio`, title: "Vetra Studio" },
      { id: `academy/GetStarted/VetraCloud`, title: "Vetra Cloud" },
      { id: `academy/GetStarted/VetraDrive`, title: "Vetra Drive" },
      { id: `academy/GetStarted/Prerequisites`, title: "Prerequisites" },
      { id: `academy/GetStarted/CreateAPackageWithVetra`, title: "Create a package with Vetra" },
      { id: `academy/GetStarted/BuilderTools`, title: "Builder tools" },
    ],
  },
  {
    key: "document-model-creation",
    title: "Document model creation",
    description:
      "Design a document model: its state schema, operations, reducers, and tests.",
    lessons: [
      { id: `${BASE}/DocumentModelCreation/WhatIsADocumentModel`, title: "What is a document model?" },
      { id: `${BASE}/DocumentModelCreation/SpecifyTheStateSchema`, title: "Specify the state schema" },
      { id: `${BASE}/DocumentModelCreation/SpecifyDocumentOperations`, title: "Specify document operations" },
      { id: `${BASE}/DocumentModelCreation/UseTheDocumentModelGenerator`, title: "Use the document model generator" },
      { id: `${BASE}/DocumentModelCreation/ImplementDocumentReducers`, title: "Implement document reducers" },
      { id: `${BASE}/DocumentModelCreation/ImplementDocumentModelTests`, title: "Implement document model tests" },
      { id: `${BASE}/DocumentModelCreation/ExampleToDoListRepository`, title: "Example: Todo-demo-package" },
      { id: `${BASE}/DocumentModelCreation/DocumentModelVersioning`, title: "Document model versioning" },
    ],
  },
  {
    key: "building-user-experiences",
    title: "Building user experiences",
    description:
      "Build document editors and drive-apps, add document tools, and wire up authorization.",
    lessons: [
      { id: `${BASE}/BuildingUserExperiences/BuildingDocumentEditors`, title: "Build document editors" },
      { id: `${BASE}/BuildingUserExperiences/BuildingADriveExplorer`, title: "Build a Drive-app" },
      { id: `${BASE}/BuildingUserExperiences/CSSCustomization`, title: "CSS customization for Connect" },
      { id: `${BASE}/BuildingUserExperiences/DocumentTools/OperationHistory`, title: "Operations history" },
      { id: `${BASE}/BuildingUserExperiences/DocumentTools/RevisionHistoryTimeline`, title: "Revision history timeline" },
      { id: `${BASE}/BuildingUserExperiences/DocumentTools/InspectorModal`, title: "Inspector modal" },
      { id: `${BASE}/BuildingUserExperiences/Authorization/RenownAuthenticationFlow`, title: "Renown authentication flow" },
      { id: `${BASE}/BuildingUserExperiences/Authorization/DocumentPermissions`, title: "Document permission system" },
      { id: `${BASE}/BuildingUserExperiences/Authorization/Signing`, title: "Signing" },
      { id: `${BASE}/BuildingUserExperiences/Authorization/Authorization`, title: "Reactor API authorization" },
    ],
  },
  {
    key: "work-with-data",
    title: "Work with data",
    description:
      "Configure drives, query with subgraphs, and build processors over your data.",
    lessons: [
      { id: `${BASE}/WorkWithData/ConfiguringDrives`, title: "Configure a drive" },
      { id: `${BASE}/WorkWithData/UsingSubgraphs`, title: "Using subgraphs" },
      { id: `${BASE}/WorkWithData/BuildingAProcessor`, title: "Building a processor" },
      { id: `${BASE}/WorkWithData/ProcessorBestPractices`, title: "Processor best practices" },
      { id: `${BASE}/WorkWithData/RelationalDbProcessor`, title: "Relational database processor" },
    ],
  },
  {
    key: "launch",
    title: "Launch",
    description:
      "Publish your package and deploy it to a configured environment.",
    lessons: [
      { id: `${BASE}/Launch/PublishYourProject`, title: "Publish your package" },
      { id: `${BASE}/Launch/SetupEnvironment`, title: "Setup your environment" },
      { id: `${BASE}/Launch/ConfigureEnvironment`, title: "Configure your environment" },
      { id: `${BASE}/Launch/DockerDeployment`, title: "Docker deployment guide" },
    ],
  },
];

/** Flat, ordered list of every lesson across all modules (for next/prev). */
export const flatLessons: Lesson[] = modules.flatMap((m) => m.lessons);

/** Total lesson count, used for the overall progress readout. */
export const totalLessons = flatLessons.length;

/** Build the in-site href for a lesson. routeBasePath is "/", so URL is `/<id>`. */
export function lessonHref(lesson: Lesson): string {
  return `/${lesson.id}`;
}

/** Find the next lesson after a given doc id, or undefined if it's the last. */
export function nextLesson(docId: string): Lesson | undefined {
  const idx = flatLessons.findIndex((l) => l.id === docId);
  return idx === -1 ? undefined : flatLessons[idx + 1];
}

/** True if the given doc id is part of the Learn track. */
export function isLearnLesson(docId: string): boolean {
  return flatLessons.some((l) => l.id === docId);
}
