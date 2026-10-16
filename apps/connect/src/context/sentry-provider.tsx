import { useInitSentry } from "../hooks/useInitSentry.js";

interface SentryProviderProps {
  children?: React.ReactNode;
}

export const SentryProvider: React.FC<SentryProviderProps> = ({ children }) => {
  useInitSentry();

  return children;
};
