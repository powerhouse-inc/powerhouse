import type { Document, ExtendedState } from '../../document/types';
import type { ScopeFrameworkState } from '@acaldas/document-model-graphql/scope-framework';
import type { ScopeFrameworkAction } from './actions';

import type * as types from '@acaldas/document-model-graphql/scope-framework';

export type ExtendedScopeFrameworkState = ExtendedState<ScopeFrameworkState>;
export type ScopeFrameworkDocument = Document<ScopeFrameworkState, ScopeFrameworkAction>;
export { types, ScopeFrameworkState, ScopeFrameworkAction };