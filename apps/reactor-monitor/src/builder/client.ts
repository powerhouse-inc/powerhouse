import type {
  CapabilitiesResponse,
  DraftCheckResponse,
  DraftRequest,
  ExportResponse,
  Instance,
  Project,
} from "../controller/api.js";

/** The controller calls the builder makes. */
export interface BuilderClient {
  projects(): Promise<Project[]>;
  hosts(project: string): Promise<string[]>;
  capabilities(): Promise<CapabilitiesResponse>;
  exportHost(project: string, host: string): Promise<ExportResponse>;
  checkDraft(request: DraftRequest): Promise<DraftCheckResponse>;
  startDraft(request: DraftRequest): Promise<Instance>;
}
