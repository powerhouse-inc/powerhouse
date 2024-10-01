import { useState } from 'react';
import { TextInputVariant, stylesVariant } from 'document-model-libs/utils';
import {
    ScopeFrameworkElement,
    ScopeFrameworkElementType,
} from '../../../document-models/scope-framework';

interface AtlasElementProps {
    readonly element: ScopeFrameworkElement;
    readonly onSetRootPath?: (newRootPath: string) => void;
    readonly onUpdateName?: (id: string, newName: string) => void;
    readonly onUpdateType?: (
        id: string,
        newType: ScopeFrameworkElementType,
    ) => void;
    readonly onUpdateComponents?: (
        id: string,
        newComponents: Record<string, string>,
    ) => void;
    readonly onDelete?: (id: string) => void;
    readonly mode: 'light' | 'dark';
}

const isFirstElement = (element: ScopeFrameworkElement) => {
    return element.type !== 'Section' && element.type !== 'Core';
};

function AtlasElement(props: AtlasElementProps) {
    const components = props.element.components;

    const [hasFocus, setFocus] = useState<boolean>(false);
    const handleFocus = () => setFocus(true);
    const handleBlur = () => setFocus(false);

    const handleNameUpdate = (newName: string) =>
        props.onUpdateName?.(props.element.id, newName);
    const handleDelete = () => props.onDelete?.(props.element.id);

    const handleTypeUpdate = (newType: string) => {
        if (['Scope', 'Article', 'Section', 'Core'].includes(newType)) {
            props.onUpdateType?.(
                props.element.id,
                newType as ScopeFrameworkElementType,
            );
        }
    };

    const handleComponentsUpdate = (newContent: string) => {
        props.onUpdateComponents?.(props.element.id, {
            content: newContent,
        });
    };

    const sizeMap = {
        Scope: 'larger',
        Article: 'large',
        Section: 'medium',
        Core: 'medium',
        TypeSpecification: 'medium',
    };

    return (
        <div
            className={
                isFirstElement(props.element)
                    ? 'atlas-element atlas-element--first'
                    : 'atlas-element'
            }
            onBlur={handleBlur}
            onFocus={handleFocus}
        >
            <div className="atlas-element--header">
                <div className="atlas-element--header-component atlas-element--path">
                    {props.element.path}
                </div>
                <div className="atlas-element--header-component atlas-element--type">
                    <TextInputVariant
                        labelStyle
                        onSubmit={handleTypeUpdate}
                        size="smaller"
                        theme={props.mode}
                        value={props.element.type || ''}
                    />
                </div>
                <div className="atlas-element--header-component atlas-element--name">
                    <TextInputVariant
                        onEmpty={handleDelete}
                        onSubmit={handleNameUpdate}
                        size={
                            sizeMap[
                                props.element.type || 'Section'
                            ] as stylesVariant.TypographySize
                        }
                        theme={props.mode}
                        value={props.element.name ?? ''}
                    />
                </div>
                <div className="atlas-element--header-component atlas-element--version" />
                <div className="atlas-element--header-component atlas-element--icons" />
            </div>
            <div className="atlas-element--componentsList">
                <div className="atlas-element--component">
                    <div className="atlas-element--componentLabel">Content</div>
                    <div className="atlas-element--componentInput">
                        <TextInputVariant
                            onSubmit={handleComponentsUpdate}
                            theme={props.mode}
                            value={
                                components && 'content' in components
                                    ? components.content || ''
                                    : ''
                            } // TODO deal with TypeSpecificationComponent
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AtlasElement;
