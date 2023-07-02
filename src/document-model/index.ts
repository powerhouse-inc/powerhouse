import { actions as BaseActions } from '../document';
import { reducer } from './gen/reducer';
import * as gen from './gen';

const { DocumentModel, ...DocumentModelActions } = gen;
const actions = { ...BaseActions, ...DocumentModelActions };

export {
    actions,
    reducer, 
    DocumentModel 
}