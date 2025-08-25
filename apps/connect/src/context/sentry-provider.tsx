import { useInitSentry } from "#hooks";

interface SentryProviderProps {
  children?: React.ReactNode;
}

export const SentryProvider: React.FC<SentryProviderProps> = ({ children }) => {
  useInitSentry();

  return children;
};
