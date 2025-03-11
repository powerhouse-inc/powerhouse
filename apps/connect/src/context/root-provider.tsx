import { useInitSenty } from '#hooks';

interface RootProviderProps {
    children?: React.ReactNode;
}

export const RootProvider: React.FC<RootProviderProps> = ({ children }) => {
    useInitSenty();

    return children;
};
