import { useModal } from '@powerhousedao/common';
import { ReadRequiredModal } from '@powerhousedao/design-system';
import type React from 'react';
import { Trans, useTranslation } from 'react-i18next';

export const CookiesPolicyModal: React.FC = () => {
    const { isOpen, hide } = useModal('cookiesPolicy');

    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <ReadRequiredModal
            open={isOpen}
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
            onContinue={hide}
            overlayProps={{ style: { zIndex: 10000 } }}
        />
    );
};
