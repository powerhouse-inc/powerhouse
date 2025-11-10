import { ReadRequiredModal } from "@powerhousedao/design-system/connect/components/modal/read-required-modal";
import { closePHModal, usePHModal } from "@powerhousedao/reactor-browser";
import { Trans, useTranslation } from "react-i18next";

export const CookiesPolicyModal: React.FC = () => {
  const phModal = usePHModal();
  const open = phModal?.type === "cookiesPolicy";
  const { t } = useTranslation();

  return (
    <ReadRequiredModal
      open={open}
      header={t("modals.cookiesPolicy.title")}
      body={
        <Trans
          i18nKey="modals.cookiesPolicy.body"
          components={{
            subtitle: <h2 className="mb-4 text-lg font-bold" />,
            p: <p className="mb-2" />,
            list: <ul className="mb-4 list-disc pl-6" />,
            bullet: <li />,
          }}
        />
      }
      bodyProps={{ className: "text-left" }}
      closeLabel="Close"
      onContinue={() => closePHModal()}
      overlayProps={{ style: { zIndex: 10000 } }}
    />
  );
};
