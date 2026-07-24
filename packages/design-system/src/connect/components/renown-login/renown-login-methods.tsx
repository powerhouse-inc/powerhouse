import { Loader2, Mail, Smartphone, Wallet } from "lucide-react";
import { useState, type FC, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

// One selectable login method. Agnostic: the caller supplies the id (a
// LoginMethod value), label and handler; this component owns only the visuals.
export interface RenownLoginOption {
  id: string;
  label: string;
  onSelect: () => void;
  lastUsed?: boolean;
}

export interface RenownLoginMethodsProps {
  methods: RenownLoginOption[];
  // Global login-in-progress + last-error, owned by the caller. The clicked
  // button shows a spinner while loading is true.
  loading?: boolean;
  error?: string | null;
  className?: string;
}

// Colored Google "G" mark.
const GoogleMark: FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.321 0 2.508.454 3.44 1.346l2.582-2.581C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
    />
  </svg>
);

// Apple mark (monochrome — follows text color).
const AppleMark: FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.51 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

const METHOD_ICONS: Record<string, ReactNode> = {
  wallet: <Wallet size={18} aria-hidden="true" />,
  email: <Mail size={18} aria-hidden="true" />,
  sms: <Smartphone size={18} aria-hidden="true" />,
  google: <GoogleMark />,
  apple: <AppleMark />,
};

const baseButton =
  "relative flex h-10 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-60";
const primaryButton = "bg-primary text-primary-foreground hover:bg-primary/85";
const secondaryButton =
  "border border-border bg-card text-foreground hover:bg-muted";

// Reference-styled Renown login: a primary "Connect a Wallet" action, an "or"
// divider, then branded buttons for the configured social/email methods.
export const RenownLoginMethods: FC<RenownLoginMethodsProps> = ({
  methods,
  loading = false,
  error,
  className,
}) => {
  const [pendingId, setPendingId] = useState<string | null>(null);

  const wallet = methods.find((method) => method.id === "wallet");
  const others = methods.filter((method) => method.id !== "wallet");

  const renderButton = (method: RenownLoginOption, primary: boolean) => {
    // Only the clicked button shows the spinner, and only while loading.
    const isPending = loading && pendingId === method.id;
    return (
      <button
        key={method.id}
        type="button"
        disabled={loading}
        onClick={() => {
          setPendingId(method.id);
          method.onSelect();
        }}
        className={twMerge(
          baseButton,
          primary ? primaryButton : secondaryButton,
          isPending && "animate-pulse",
        )}
      >
        {isPending ? (
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        ) : (
          METHOD_ICONS[method.id]
        )}
        <span>{method.label}</span>
        {method.lastUsed ? (
          <span className="absolute -top-2 right-2 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] leading-none font-semibold text-background shadow-sm">
            Last used
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className={twMerge("flex w-full flex-col gap-3", className)}>
      {wallet ? renderButton(wallet, true) : null}
      {wallet && others.length > 0 ? (
        <div className="my-1 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs tracking-wider text-muted-foreground uppercase">
            or
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
      ) : null}
      {others.map((method) => renderButton(method, false))}
      {error ? (
        <p className="text-center text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
};
