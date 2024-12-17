import { useTranslation } from 'react-i18next';

export const ReloadConnectToast = () => {
    const { t } = useTranslation();

    return (
        <div>
            <p className="font-medium">{t('notifications.reloadApp')}</p>
            <button
                onClick={() => location.reload()}
                className="underline decoration-solid underline-offset-2"
            >
                {t('common.reloadConnect')} 🔄
            </button>
        </div>
    );
};
