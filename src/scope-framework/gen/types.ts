import type { Document } from '../../document/types';
import type { ScopeFrameworkState } from '@acaldas/document-model-graphql/scope-framework';
import type { ScopeFrameworkAction } from './actions';

import type * as types from '@acaldas/document-model-graphql/scope-framework';

type ExtendedScopeFrameworkState = Document<ScopeFrameworkState, ScopeFrameworkAction>;

export { types, ExtendedScopeFrameworkState, ScopeFrameworkState, ScopeFrameworkAction };