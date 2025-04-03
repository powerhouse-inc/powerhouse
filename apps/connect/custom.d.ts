declare module '*.svg' {
    const ReactComponent: React.FunctionComponent<
        React.SVGAttributes<SVGElement>
    >;
    export { ReactComponent };
}

declare module 'PH:EXTERNAL_PACKAGES' {}
