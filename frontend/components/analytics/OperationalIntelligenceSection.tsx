import type { AnalyticsResponse } from '../../lib/api';
import { OperationalIntelligenceInsights } from './OperationalIntelligenceInsights';
import type { AnalyticsDashboardController } from './useAnalyticsDashboard';

type IntelligenceData = NonNullable<NonNullable<AnalyticsResponse['operations']>['intelligence']>;

interface OperationalIntelligenceSectionProps {
    dashboard: AnalyticsDashboardController;
    intelligence: IntelligenceData;
}

export function OperationalIntelligenceSection({
    dashboard,
    intelligence
}: OperationalIntelligenceSectionProps) {
    return (
        <div>
            <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Operational Intelligence</h2>
                <p className="text-sm text-gray-500">
                    Advisory signals derived from Requests, Notes, Tasks, Notices, and their relationships.
                </p>
            </div>
            <OperationalIntelligenceInsights dashboard={dashboard} intelligence={intelligence} />
        </div>
    );
}
