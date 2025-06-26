import { useInitSentry } from '#hooks';

interface RootProviderProps {
    children?: React.ReactNode;
}

export const RootProvider: React.FC<RootProviderProps> = ({ children }) => {
    useInitSentry();

    return children;
};
