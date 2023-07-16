import { BaseDocument } from '../../../document/object';

import {
    SetRootPathInput,
    AddElementInput,
    UpdateElementTypeInput,
    UpdateElementNameInput,
    UpdateElementComponentsInput,
    RemoveElementInput,
    ReorderElementsInput,
    MoveElementInput,
} from '@acaldas/document-model-graphql/scope-framework';

import {
    setRootPath,
    addElement,
    updateElementType,
    updateElementName,
    updateElementComponents,
    removeElement,
    reorderElements,
    moveElement,
} from './creators';

import { ScopeFrameworkAction } from '../actions';
import { ScopeFrameworkState } from '@acaldas/document-model-graphql/scope-framework';

export default class ScopeFramework_Main extends BaseDocument<
    ScopeFrameworkState, ScopeFrameworkAction
> {
    public setRootPath(input: SetRootPathInput) {
        return this.dispatch(setRootPath(input));
    }
    
    public addElement(input: AddElementInput) {
        return this.dispatch(addElement(input));
    }
    
    public updateElementType(input: UpdateElementTypeInput) {
        return this.dispatch(updateElementType(input));
    }
    
    public updateElementName(input: UpdateElementNameInput) {
        return this.dispatch(updateElementName(input));
    }
    
    public updateElementComponents(input: UpdateElementComponentsInput) {
        return this.dispatch(updateElementComponents(input));
    }
    
    public removeElement(input: RemoveElementInput) {
        return this.dispatch(removeElement(input));
    }
    
    public reorderElements(input: ReorderElementsInput) {
        return this.dispatch(reorderElements(input));
    }
    
    public moveElement(input: MoveElementInput) {
        return this.dispatch(moveElement(input));
    }
    
}