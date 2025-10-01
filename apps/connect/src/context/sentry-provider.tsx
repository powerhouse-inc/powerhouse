import { useInitSentry } from "@powerhousedao/connect";

interface SentryProviderProps {
  children?: React.ReactNode;
}

export const SentryProvider: React.FC<SentryProviderProps> = ({ children }) => {
  useInitSentry();

  return children;
};
