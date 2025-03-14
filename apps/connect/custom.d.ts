declare module '*.svg' {
    const ReactComponent: React.FunctionComponent<
        React.SVGAttributes<SVGElement>
    >;
    export { ReactComponent };
}

declare module 'LOCAL_DOCUMENT_MODELS' {}
declare module 'LOCAL_DOCUMENT_EDITORS' {}
declare module 'PH:EXTERNAL_PACKAGES' {}
