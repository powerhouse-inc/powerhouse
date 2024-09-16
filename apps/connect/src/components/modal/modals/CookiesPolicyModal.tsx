import { ReadRequiredModal } from '@powerhousedao/design-system';
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

export interface DisclaimerModalProps {
    open: boolean;
    onClose: () => void;
}

export const CookiesPolicyModal: React.FC<DisclaimerModalProps> = props => {
    const { open, onClose } = props;

    const { t } = useTranslation();

    return (
        <ReadRequiredModal
            open={open}
            header={t('modals.cookiesPolicy.title')}
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
            bodyProps={{ className: 'text-left' }}
            closeLabel="Close"
            onContinue={() => onClose()}
            overlayProps={{ style: { zIndex: 10000 } }}
        />
    );
};
