import { upgradeDocument } from "@powerhousedao/reactor-browser";
import { childLogger } from "document-model";
import { useTranslation } from "react-i18next";

const logger = childLogger(["DocumentUpgradeToast"]);

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
        onClick={() => {
          upgradeDocument(documentId).catch((error) =>
            logger.error("Error upgrading document: @error", error),
          );
        }}
        className="underline decoration-solid underline-offset-2"
      >
        {t("common.updateDocument")}
      </button>
    </div>
  );
};
