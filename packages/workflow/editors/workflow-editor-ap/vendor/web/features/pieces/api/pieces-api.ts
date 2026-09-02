// ph-replacement: upstream calls the Activepieces server REST API; this
// implementation serves piece metadata from the workflow-runtime subgraph.
import {
  PieceMetadataModel,
  PieceMetadataModelSummary,
  PiecePackageInformation,
  PropertyType,
  type ExecutePropsResult,
} from '../../../../pieces-framework/index.js';
import {
  AddPieceRequestBody,
  ApEdition,
  GetPieceRequestParams,
  GetPieceRequestQuery,
  ListPiecesRequestQuery,
  PieceOptionRequest,
} from '../../../../shared/index.js';

import {
  fetchCatalogSummaries,
  fetchPieceModel,
  loadPieceOptions,
} from '../../../../../shims/ap-runtime.js';

export const piecesApi = {
  async list(
    request: ListPiecesRequestQuery,
  ): Promise<PieceMetadataModelSummary[]> {
    const pieces = await fetchCatalogSummaries();
    const query = request.searchQuery?.toLowerCase();
    if (!query) return pieces;
    return pieces.filter(
      (piece) =>
        piece.displayName.toLowerCase().includes(query) ||
        piece.description.toLowerCase().includes(query),
    );
  },
  get(
    request: GetPieceRequestParams & GetPieceRequestQuery,
  ): Promise<PieceMetadataModel> {
    return fetchPieceModel(request.name);
  },
  async options<
    T extends
      | PropertyType.DROPDOWN
      | PropertyType.MULTI_SELECT_DROPDOWN
      | PropertyType.DYNAMIC,
  >(request: PieceOptionRequest, propertyType: T): Promise<ExecutePropsResult<T>> {
    return loadPieceOptions(request, propertyType) as Promise<
      ExecutePropsResult<T>
    >;
  },
  syncFromCloud(): Promise<void> {
    return Promise.resolve();
  },
  install(_params: AddPieceRequestBody): Promise<PieceMetadataModel> {
    return Promise.reject(
      new Error('Installing pieces is not supported in this editor'),
    );
  },
  registry(
    _release: string,
    _edition: ApEdition,
  ): Promise<PiecePackageInformation[]> {
    return Promise.resolve([]);
  },
  delete(_id: string): Promise<void> {
    return Promise.reject(
      new Error('Deleting pieces is not supported in this editor'),
    );
  },
};
