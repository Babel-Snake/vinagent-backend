'use client';

import { OperationalIntelligenceControls } from '../analytics/OperationalIntelligenceControls';
import { useAnalyticsDashboard } from '../analytics/useAnalyticsDashboard';

/**
 * Intelligence thresholds and scheduling affect winery-wide behaviour, so they
 * live with configuration rather than the read/review experience in Insights.
 */
export function IntelligenceSettingsTab() {
    const dashboard = useAnalyticsDashboard();

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-lg font-semibold text-[#1c231f]">Intelligence settings</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                    Manage scheduling, reminder timing, and signal thresholds. Review and action generated signals in Insights.
                </p>
            </div>
            <OperationalIntelligenceControls dashboard={dashboard} />
        </section>
    );
}
