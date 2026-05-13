{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$comment": "Maps academy doc sections to the monorepo packages they are responsible for documenting. Used by ph-lora to scope code↔doc consistency checks. Update this file when new packages are added or doc ownership changes.",
  "sections": [
    {
      "id": "get-started",
      "label": "Get Started",
      "docPath": "docs/academy/01-GetStarted",
      "packages": ["clis/ph-cmd", "clis/ph-cli", "packages/vetra"],
      "checkFocus": "CLI commands (ph init, ph install, ph add), package install steps, generated project structure"
    },
    {
      "id": "mastery-builder-environment",
      "label": "Mastery Track — Builder Environment",
      "docPath": "docs/academy/02-MasteryTrack/01-BuilderEnvironment",
      "packages": ["clis/ph-cmd", "packages/vetra"],
      "checkFocus": "Vetra Studio setup steps, CLI prerequisites, ph-cmd version requirements"
    },
    {
      "id": "mastery-document-model-creation",
      "label": "Mastery Track — Document Model Creation",
      "docPath": "docs/academy/02-MasteryTrack/02-DocumentModelCreation",
      "packages": [
        "packages/document-model",
        "packages/codegen",
        "packages/builder-tools"
      ],
      "checkFocus": "Document model schema format, codegen output shape, reducer function signatures, generated file paths"
    },
    {
      "id": "mastery-building-user-experiences",
      "label": "Mastery Track — Building User Experiences",
      "docPath": "docs/academy/02-MasteryTrack/03-BuildingUserExperiences",
      "packages": [
        "packages/reactor-browser",
        "packages/design-system",
        "packages/common"
      ],
      "checkFocus": "React hooks API, editor component props, drive-app interfaces, CSS customization surface"
    },
    {
      "id": "mastery-work-with-data",
      "label": "Mastery Track — Work With Data",
      "docPath": "docs/academy/02-MasteryTrack/04-WorkWithData",
      "packages": [
        "packages/reactor",
        "packages/reactor-api",
        "packages/analytics-engine",
        "packages/shared"
      ],
      "checkFocus": "Processor interface, subgraph API, analytics engine query syntax, GraphQL schema shape"
    },
    {
      "id": "mastery-launch",
      "label": "Mastery Track — Launch",
      "docPath": "docs/academy/02-MasteryTrack/05-Launch",
      "packages": ["clis/ph-cmd", "apps/switchboard", "packages/vetra"],
      "checkFocus": "Deploy commands, Docker image names, environment variable names, switchboard config format"
    },
    {
      "id": "example-usecases",
      "label": "Example Use Cases",
      "docPath": "docs/academy/03-ExampleUsecases",
      "packages": [
        "packages/document-model",
        "packages/codegen",
        "packages/reactor-browser",
        "packages/common"
      ],
      "checkFocus": "End-to-end tutorial steps, generated file names, reducer signatures, editor component API"
    },
    {
      "id": "api-references-cli",
      "label": "API References — Powerhouse CLI",
      "docPath": "docs/academy/04-APIReferences/PowerhouseCLI.md",
      "packages": ["clis/ph-cmd", "clis/ph-cli"],
      "checkFocus": "Every documented command, flag, and argument against actual CLI help output"
    },
    {
      "id": "api-references-react-hooks",
      "label": "API References — React Hooks",
      "docPath": "docs/academy/04-APIReferences/ReactHooks.md",
      "packages": ["packages/reactor-browser"],
      "checkFocus": "Hook names, parameter types, return types — compare docs against exported TypeScript signatures"
    },
    {
      "id": "api-references-reactor-client",
      "label": "API References — Reactor Client",
      "docPath": "docs/academy/04-APIReferences/ReactorClient.md",
      "packages": ["packages/reactor-browser", "packages/reactor"],
      "checkFocus": "IReactorClient interface methods, parameter and return types"
    },
    {
      "id": "api-references-relational-database",
      "label": "API References — Relational Database",
      "docPath": "docs/academy/04-APIReferences/RelationalDatabase.md",
      "packages": ["packages/reactor-browser"],
      "checkFocus": "Relational DB helper API, query types, hook signatures"
    },
    {
      "id": "api-references-renown-sdk",
      "label": "API References — Renown SDK",
      "docPath": "docs/academy/04-APIReferences/renown-sdk",
      "packages": ["packages/renown"],
      "checkFocus": "SDK method names, auth flow steps, hook and component exports"
    },
    {
      "id": "api-references-migration-guides",
      "label": "API References — Migration Guides",
      "docPath": "docs/academy/04-APIReferences",
      "packages": [
        "packages/document-model",
        "packages/reactor",
        "packages/reactor-api",
        "packages/shared"
      ],
      "checkFocus": "Breaking change descriptions, before/after code samples, removed or renamed exports"
    },
    {
      "id": "component-library",
      "label": "Component Library",
      "docPath": "docs/academy/06-ComponentLibrary",
      "packages": [
        "packages/design-system",
        "packages/reactor-browser",
        "packages/codegen"
      ],
      "checkFocus": "Component names, scalar types, prop interfaces"
    },
    {
      "id": "architecture",
      "label": "Architecture",
      "docPath": "docs/academy/05-Architecture",
      "packages": [],
      "checkFocus": "Conceptual only — skip mechanical checks. Flag if referenced package names or system names no longer match reality.",
      "skipMechanicalCheck": true
    }
  ],
  "unmappedPackages": [
    "packages/reactor-attachments",
    "packages/reactor-hypercore",
    "packages/reactor-mcp",
    "packages/registry",
    "packages/config",
    "packages/opentelemetry-instrumentation-reactor",
    "packages/powerhouse-vetra-packages",
    "packages/switchboard-gui",
    "apps/connect"
  ],
  "$unmappedNote": "These packages exist in the monorepo but have no doc section currently responsible for them. ph-lora should flag these as documentation gaps."
}
