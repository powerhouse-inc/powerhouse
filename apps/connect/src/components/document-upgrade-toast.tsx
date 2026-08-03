import { upgradeDocument } from "@powerhousedao/reactor-browser";
import { useTranslation } from "react-i18next";

export const DocumentUpgradeToast = ({
  documentId,
}: {
  documentId: string;
}) => {
  const { t } = useTranslation();

  return (
    <div>
      <p className="font-medium">
        {t("notifications.documentUpgradeAvailable")}
      </p>
      <button
        onClick={() => void upgradeDocument(documentId)}
        className="underline decoration-solid underline-offset-2"
      >
        {t("common.updateDocument")}
      </button>
    </div>
  );
};
