import { ScopeFrameworkMainOperations } from '../../gen/main/operations';

const rootSegment = (path: string): string => {
    return path.split('.', 2)[0];
};

const precedes = (pathA: string, pathB: string): boolean => {
    const segmentsA = pathA.split('.'),
        segmentsB = pathB.split('.'),
        commonLength = Math.min(segmentsA.length, segmentsB.length);

    // First segment is a letter
    if (segmentsA[0] != segmentsB[0]) {
        return segmentsA[0] < segmentsB[0];
    }

    // Next segments are integers
    for (let i = 1; i < commonLength; i++) {
        if (segmentsA[i] != segmentsB[i]) {
            return parseInt(segmentsA[i]) < parseInt(segmentsB[i]);
        }
    }

    return segmentsA.length < segmentsB.length;
};

export const reducer: ScopeFrameworkMainOperations = {
    setRootPathOperation(state, action) {
        const rootPathPattern = /^[A-Z]+$/;

        if (!action.input.newRootPath.match(rootPathPattern)) {
            throw new Error(
                `Invalid root path format ${action.input.newRootPath}. Use one or more capital letters: 'A', 'D', 'AQ', ...`,
            );
        }

        const findString = state.rootPath + '.',
            newString = action.input.newRootPath + '.';

        state.rootPath = action.input.newRootPath;
        state.elements = state.elements.map(e => ({
            ...e,
            path: e.path.replace(findString, newString),
        }));
    },

    addElementOperation(state, action) {
        const result = [];
        const newElement = {
            id: action.input.id,
            version: 1,
            path: action.input.path,
            type: action.input.type,
            name: action.input.name,
            components: action.input.components,
        };

        if (rootSegment(newElement.path) != state.rootPath) {
            throw new Error(
                `Cannot add element with root segment ${rootSegment(
                    newElement.path,
                )} to document with root path ${state.rootPath}`,
            );
        }

        let inserted = false,
            nextElement = null;
        while ((nextElement = state.elements.shift())) {
            if (!inserted && precedes(newElement.path, nextElement.path)) {
                // TODO: add "sawParent" and "maySucceed(lastElement)" tests
                result.push(newElement);
                inserted = true;
            }

            if (!inserted && newElement.path == nextElement.path) {
                throw new Error(
                    `New element's path ${newElement.path} already exists.`,
                );
            }

            result.push(nextElement);
        }

        if (!inserted) {
            result.push(newElement);
        }

        state.elements = result;
    },

    updateElementTypeOperation(state, action) {
        state.elements
            .filter(e => e.id == action.input.id)
            .forEach(e => {
                e.type = action.input.type;
            });
    },

    updateElementNameOperation(state, action) {
        state.elements
            .filter(e => e.id == action.input.id)
            .forEach(e => {
                e.name = action.input.name;
            });
    },

    updateElementComponentsOperation(state, action) {
        state.elements
            .filter(e => e.id == action.input.id)
            .forEach(e => {
                e.components = action.input.components;
            });
    },

    removeElementOperation(state, action) {
        const element = state.elements.filter(e => e.id == action.input.id)[0];
        if (element) {
            state.elements = state.elements.filter(
                e => !e.path.startsWith(element.path),
            );
        }
    },

    reorderElementsOperation(state, action) {
        throw new Error(
            'Reducer "reorderElementsOperation" not yet implemented',
        );
    },

    moveElementOperation(state, action) {
        throw new Error('Reducer "moveElementOperation" not yet implemented');
    },
};
