import { useInitSentry } from "@powerhousedao/connect/hooks";

interface SentryProviderProps {
  children?: React.ReactNode;
}

export const SentryProvider: React.FC<SentryProviderProps> = ({ children }) => {
  useInitSentry();

  return children;
};
