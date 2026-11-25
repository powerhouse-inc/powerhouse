import { Sections } from "../../components/section.js";
import { ApiUnavailable } from "../../shell/api-unavailable.js";
import { useDevtoolsInfo } from "../../shell/use-info.js";
import { AgentSection } from "./agent-section.js";
import { ModuleKindsSection } from "./module-kinds-section.js";
import { ProjectSection } from "./project-section.js";
import { ServicesSection } from "./services-section.js";

export function OverviewPage() {
  const result = useDevtoolsInfo();
  if (result.state === "unavailable") {
    return (
      <div data-testid="ph-overview" data-state="unavailable">
        <ApiUnavailable
          data-testid="ph-overview-unavailable"
          code={result.code}
          message={result.message}
        />
      </div>
    );
  }

  const info = result.state === "ready" ? result.info : null;
  return (
    <div data-testid="ph-overview" data-state={result.state} aria-busy={!info}>
      <Sections>
        <ModuleKindsSection />
        <ServicesSection info={info} />
        <div className="grid grid-cols-1 gap-x-8 gap-y-7 @3xl/main:grid-cols-2">
          <ProjectSection info={info} />
          <AgentSection mcpUrl={info?.mcp.url} />
        </div>
      </Sections>
    </div>
  );
}
