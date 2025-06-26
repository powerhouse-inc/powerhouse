import { useGetDocumentModelModule, useModal } from '@powerhousedao/common';
import { ConnectConfirmationModal } from '@powerhousedao/design-system';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { exportFile } from '../../../utils/file';

export function ExportWithErrorsModal() {
    const { isOpen, props, hide } = useModal('exportWithErrors');
    const { document, validationErrors } = props;
    const getDocumentModelModule = useGetDocumentModelModule();
    const { t } = useTranslation();
    const onContinue = useCallback(() => {
        hide();
        return exportFile(document, getDocumentModelModule);
    }, [document, getDocumentModelModule, hide]);

    if (!isOpen) return null;

    return (
        <ConnectConfirmationModal
            header={t('modals.exportDocumentWithErrors.title')}
            open={isOpen}
            title={t('modals.exportDocumentWithErrors.title')}
            body={
                <div>
                    <p>{t('modals.exportDocumentWithErrors.body')}</p>
                    <ul className="mt-4 flex list-disc flex-col items-start px-4 text-xs">
                        {validationErrors.map((error, index) => (
                            <li key={index}>{error.message}</li>
                        ))}
                    </ul>
                </div>
            }
            cancelLabel={t('common.cancel')}
            continueLabel={t('common.export')}
            onCancel={hide}
            onContinue={onContinue}
        />
    );
}
