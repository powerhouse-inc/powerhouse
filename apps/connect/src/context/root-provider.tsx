import { useInitSenty } from 'src/hooks/useInitSentry';

interface RootProviderProps {
    children?: React.ReactNode;
}

export const RootProvider: React.FC<RootProviderProps> = ({ children }) => {
    useInitSenty();

    return children;
};
