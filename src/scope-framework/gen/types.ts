import type { Document, ExtendedState } from '../../document/types';
import type { ScopeFrameworkState } from './schema/types';
import type { ScopeFrameworkAction } from './actions';

export { z } from './schema';
export type * from './schema/types';
export type ExtendedScopeFrameworkState = ExtendedState<ScopeFrameworkState>;
export type ScopeFrameworkDocument = Document<ScopeFrameworkState, ScopeFrameworkAction>;
export { ScopeFrameworkState, ScopeFrameworkAction };