import {
    ScopeFrameworkElement,
    ScopeFrameworkElementType,
} from '../../../document-models/scope-framework';
import { useState } from 'react';
import { TypographySize } from '../../common/stylesVariant';
import TextInput from '../../common/textInputVariant';

interface AtlasElementProps {
    element: ScopeFrameworkElement;
    onSetRootPath?: (newRootPath: string) => void;
    onUpdateName?: (id: string, newName: string) => void;
    onUpdateType?: (id: string, newType: ScopeFrameworkElementType) => void;
    onUpdateComponents?: (
        id: string,
        newComponents: Record<string, string>,
    ) => void;
    onDelete?: (id: string) => void;
    mode: 'light' | 'dark';
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
            onFocus={handleFocus}
            onBlur={handleBlur}
        >
            <div className="atlas-element--header">
                <div className="atlas-element--header-component atlas-element--path">
                    {props.element.path}
                </div>
                <div className="atlas-element--header-component atlas-element--type">
                    <TextInput
                        value={props.element.type || ''}
                        onSubmit={handleTypeUpdate}
                        theme={props.mode}
                        labelStyle
                        size="smaller"
                    />
                </div>
                <div className="atlas-element--header-component atlas-element--name">
                    <TextInput
                        value={props.element.name ?? ''}
                        onSubmit={handleNameUpdate}
                        onEmpty={handleDelete}
                        size={
                            sizeMap[
                                props.element.type || 'Section'
                            ] as TypographySize
                        }
                        theme={props.mode}
                    />
                </div>
                <div className="atlas-element--header-component atlas-element--version"></div>
                <div className="atlas-element--header-component atlas-element--icons"></div>
            </div>
            <div className="atlas-element--componentsList">
                <div className="atlas-element--component">
                    <div className="atlas-element--componentLabel">Content</div>
                    <div className="atlas-element--componentInput">
                        <TextInput
                            value={
                                components && 'content' in components
                                    ? components.content || ''
                                    : ''
                            } // TODO deal with TypeSpecificationComponent
                            onSubmit={handleComponentsUpdate}
                            theme={props.mode}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AtlasElement;
