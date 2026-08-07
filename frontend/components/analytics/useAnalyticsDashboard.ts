import { useCallback, useEffect, useState } from 'react';
import {
    createOperationalIntelligenceSignal,
    createTaskFromOperationalIntelligenceSignal,
    getAnalytics,
    getOperationalIntelligenceConfig,
    getOperationalIntelligenceSignals,
    materializeOperationalIntelligenceSignals,
    previewOperationalIntelligenceConfig,
    reviewOperationalIntelligenceSignal,
    updateOperationalIntelligenceConfig,
    type AnalyticsRecurrenceCluster,
    type AnalyticsResponse,
    type OperationalIntelligenceConfig,
    type OperationalIntelligenceConfigAuditEvent,
    type OperationalIntelligenceConfigPreset,
    type OperationalIntelligenceConfigPreviewResponse,
    type OperationalIntelligenceSignal
} from '../../lib/api';
import { errorMessage } from '../../lib/errors';

export function useAnalyticsDashboard() {
    const [data, setData] = useState<AnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [signals, setSignals] = useState<OperationalIntelligenceSignal[]>([]);
    const [signalLoading, setSignalLoading] = useState(true);
    const [signalError, setSignalError] = useState('');
    const [signalBusyId, setSignalBusyId] = useState<string | number | null>(null);
    const [intelligenceConfig, setIntelligenceConfig] = useState<OperationalIntelligenceConfig | null>(null);
    const [configPresets, setConfigPresets] = useState<OperationalIntelligenceConfigPreset[]>([]);
    const [configFieldMetadata, setConfigFieldMetadata] = useState<Record<string, string>>({});
    const [configAuditEvents, setConfigAuditEvents] = useState<OperationalIntelligenceConfigAuditEvent[]>([]);
    const [configPreview, setConfigPreview] = useState<OperationalIntelligenceConfigPreviewResponse | null>(null);
    const [configPreviewPreset, setConfigPreviewPreset] = useState<OperationalIntelligenceConfigPreset['key'] | null>(null);
    const [configPreviewTitle, setConfigPreviewTitle] = useState('Control impact preview');
    const [configPreviewLoading, setConfigPreviewLoading] = useState(false);
    const [configStatus, setConfigStatus] = useState('');
    const [configSaving, setConfigSaving] = useState(false);
    const [period, setPeriod] = useState('month');
    const [offset, setOffset] = useState(0);

    const loadSignals = useCallback(() => {
        setSignalLoading(true);
        setSignalError('');
        Promise.all([
            getOperationalIntelligenceSignals({ pageSize: 10 }),
            getOperationalIntelligenceConfig()
        ])
            .then(([result, configResponse]) => {
                setSignals(result.signals || []);
                setIntelligenceConfig(configResponse.config);
                setConfigPresets(configResponse.presets || []);
                setConfigFieldMetadata(configResponse.fieldMetadata || {});
                setConfigAuditEvents(configResponse.auditEvents || []);
            })
            .catch(err => setSignalError(errorMessage(err, 'Failed to load operational intelligence')))
            .finally(() => setSignalLoading(false));
    }, []);

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        getAnalytics(period, offset)
            .then(setData)
            .catch(err => setError(errorMessage(err, 'Failed to load analytics')))
            .finally(() => setLoading(false));
    }, [period, offset]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            load();
            loadSignals();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [load, loadSignals]);

    const runSignalAction = async (busyId: string | number, action: () => Promise<unknown>, fallback: string) => {
        try {
            setSignalBusyId(busyId);
            setSignalError('');
            await action();
            loadSignals();
        } catch (err: unknown) {
            setSignalError(errorMessage(err, fallback));
        } finally {
            setSignalBusyId(null);
        }
    };

    const saveRecurrenceSignal = (cluster: AnalyticsRecurrenceCluster) => runSignalAction(
        `recurrence-${cluster.key}`,
        () => createOperationalIntelligenceSignal({
            signalType: 'RECURRENCE',
            severity: cluster.count >= 4 ? 'critical' : 'warning',
            title: `Recurring theme: ${cluster.keywords.join(', ')}`,
            summary: `${cluster.count} operational items appear to share the same theme.`,
            areaId: cluster.areaIds?.length === 1 ? cluster.areaIds[0] : null,
            periodStart: data?.period?.start || null,
            periodEnd: data?.period?.end || null,
            evidence: cluster
        }),
        'Failed to save signal'
    );

    const reviewSignal = (signalId: number, status: 'ACKNOWLEDGED' | 'DISMISSED') => runSignalAction(
        signalId,
        () => reviewOperationalIntelligenceSignal(signalId, { status }),
        'Failed to review signal'
    );

    const materializeSuggestedSignals = () => runSignalAction(
        'materialize',
        () => materializeOperationalIntelligenceSignals({ period: period as 'day' | 'week' | 'month' | 'year', offset }),
        'Failed to save suggested signals'
    );

    const actionSignal = (signalId: number) => runSignalAction(
        signalId,
        () => createTaskFromOperationalIntelligenceSignal(signalId, { reviewNote: 'Action task created from Analytics review.' }),
        'Failed to create task from signal'
    );

    const updateConfigSection = <K extends keyof OperationalIntelligenceConfig>(
        section: K,
        patch: Partial<OperationalIntelligenceConfig[K]>
    ) => {
        setIntelligenceConfig(current => current ? ({
            ...current,
            [section]: { ...current[section], ...patch }
        }) : current);
    };

    const applyConfigResponse = (response: Awaited<ReturnType<typeof updateOperationalIntelligenceConfig>>) => {
        setIntelligenceConfig(response.config);
        setConfigAuditEvents(response.auditEvents || []);
        setConfigPresets(current => response.presets || current);
        setConfigFieldMetadata(current => response.fieldMetadata || current);
        setConfigPreview(null);
        setConfigPreviewPreset(null);
        setConfigPreviewTitle('Control impact preview');
    };

    const saveIntelligenceConfig = async () => {
        if (!intelligenceConfig) return;
        try {
            setConfigSaving(true);
            setConfigStatus('');
            const response = await updateOperationalIntelligenceConfig(intelligenceConfig);
            applyConfigResponse(response);
            setConfigStatus(response.changedKeys?.length
                ? `Saved ${response.changedKeys.length} control change${response.changedKeys.length === 1 ? '' : 's'}.`
                : 'No control changes to save.');
        } catch (err: unknown) {
            setConfigStatus(errorMessage(err, 'Failed to save operational intelligence controls'));
        } finally {
            setConfigSaving(false);
        }
    };

    const previewConfig = async (
        title: string,
        preset: OperationalIntelligenceConfigPreset['key'] | null,
        config: Partial<OperationalIntelligenceConfig> & { preset?: OperationalIntelligenceConfigPreset['key'] }
    ) => {
        try {
            setConfigPreviewLoading(true);
            setConfigPreviewPreset(preset);
            setConfigPreviewTitle(title);
            setConfigStatus('');
            const response = await previewOperationalIntelligenceConfig({
                ...config,
                period: period as 'day' | 'week' | 'month' | 'year',
                offset,
                historyPeriods: 4
            });
            setConfigPreview(response);
            setConfigPresets(current => response.presets || current);
            setConfigFieldMetadata(current => response.fieldMetadata || current);
        } catch (err: unknown) {
            setConfigStatus(errorMessage(err, 'Failed to preview operational intelligence controls'));
        } finally {
            setConfigPreviewLoading(false);
        }
    };

    const previewConfigPreset = (preset: OperationalIntelligenceConfigPreset['key']) => previewConfig(
        `${configPresets.find(item => item.key === preset)?.label || preset} preset impact preview`,
        preset,
        { preset }
    );

    const previewCurrentConfig = () => intelligenceConfig
        ? previewConfig('Current edit impact preview', null, intelligenceConfig)
        : Promise.resolve();

    const applyConfigPreset = async (preset: OperationalIntelligenceConfigPreset['key']) => {
        try {
            setConfigSaving(true);
            setConfigStatus('');
            const response = await updateOperationalIntelligenceConfig({ preset });
            applyConfigResponse(response);
            setConfigStatus(`Applied ${configPresets.find(item => item.key === preset)?.label || preset} preset.`);
        } catch (err: unknown) {
            setConfigStatus(errorMessage(err, 'Failed to apply preset'));
        } finally {
            setConfigSaving(false);
        }
    };

    return {
        data, loading, error, signals, signalLoading, signalError, signalBusyId,
        intelligenceConfig, configPresets, configFieldMetadata, configAuditEvents,
        configPreview, configPreviewPreset, configPreviewTitle, configPreviewLoading,
        configStatus, configSaving, period, offset, setPeriod, setOffset, loadSignals,
        goBack: () => setOffset(value => value + 1),
        goForward: () => setOffset(value => Math.max(0, value - 1)),
        goToday: () => setOffset(0),
        periodLabel: data?.period?.label || '',
        saveRecurrenceSignal, reviewSignal, materializeSuggestedSignals, actionSignal,
        updateConfigSection, saveIntelligenceConfig, previewConfigPreset,
        previewCurrentConfig, applyConfigPreset
    };
}

export type AnalyticsDashboardController = ReturnType<typeof useAnalyticsDashboard>;
