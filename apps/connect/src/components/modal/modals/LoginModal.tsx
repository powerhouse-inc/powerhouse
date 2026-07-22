import { Icon } from "@powerhousedao/design-system";
import { Modal } from "@powerhousedao/design-system";
import { RenownLoginMethods } from "@powerhousedao/design-system/connect";
import {
  closePHModal,
  usePHModal,
  useUser,
} from "@powerhousedao/reactor-browser";
import React, { useLayoutEffect, useMemo } from "react";
import { useRenownLoginProps } from "../../../hooks/use-renown-login.js";

// The single login surface, opened via showPHModal({ type: "login" }). Matches
// the other modals' chrome (title + close, rounded-2xl, p-6).
export const LoginModal: React.FC = () => {
  const phModal = usePHModal();
  const user = useUser();
  const {
    methods: baseMethods,
    onLogin,
    loading,
    error,
  } = useRenownLoginProps();
  const open = phModal?.type === "login";

  // A method that opens its own modal (wallet/Privy) closes this one first, so
  // the two surfaces never overlap.
  const methods = useMemo(
    () =>
      baseMethods?.map((method) => ({
        ...method,
        onSelect: () => {
          closePHModal();
          method.onSelect();
        },
      })),
    [baseMethods],
  );

  useLayoutEffect(() => {
    if (open && user) closePHModal();
  }, [open, user]);

  const hasMethods = !!methods && methods.length > 0;

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) closePHModal();
      }}
      title="Log in"
      contentProps={{ className: "rounded-2xl" }}
    >
      <div className="w-96 max-w-[calc(100vw-2rem)] rounded-2xl bg-background p-6 text-foreground">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Log in</h1>
          <button
            type="button"
            aria-label="Close"
            onClick={() => closePHModal()}
            className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground outline-none hover:hover-effect"
          >
            <Icon name="Xmark" size={20} />
          </button>
        </div>
        {hasMethods ? (
          <RenownLoginMethods
            methods={methods}
            loading={loading}
            error={error}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={onLogin}
              disabled={loading}
              className="flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85 active:active-effect disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? (
                <Icon name="Reload" size={14} className="animate-spin" />
              ) : (
                <span>Connect</span>
              )}
            </button>
            {error ? (
              <p className="mt-2 text-center text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
};
