import type { ActionClassification } from '../../../../pieces-framework/index.js';
import { t } from '../../../../../shims/i18n.js';

export const ACTION_CLASSIFICATION_BADGES: Record<
  ActionClassification,
  { label: () => string; variant: 'accent' | 'destructive' }
> = {
  READ: { label: () => t('Read'), variant: 'accent' },
  SEARCH: { label: () => t('Search'), variant: 'accent' },
  WRITE: { label: () => t('Write'), variant: 'accent' },
  DESTRUCTIVE: { label: () => t('Destructive'), variant: 'destructive' },
};
