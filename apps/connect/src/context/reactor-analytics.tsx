import { AnalyticsProvider } from '@powerhousedao/reactor-browser/analytics/context';
import { type PropsWithChildren } from 'react';
import { useUnwrappedAnalyticsStore } from '../store/analytics';

export function ReactorAnalyticsProvider({ children }: PropsWithChildren) {
    const store = useUnwrappedAnalyticsStore();
    // Use store if available, otherwise render children without the provider
    return store ? (
        <AnalyticsProvider store={store}>{children}</AnalyticsProvider>
    ) : (
        children
    );
}
