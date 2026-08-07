'use client';

import { useCallback, useEffect } from 'react';
import type { TaskAction } from '../../lib/api';
import { clientLogger } from '../../lib/clientLogger';
import {
  detailSnippet,
  elementSnapshot,
  isDetailRecord,
  isHighImpactActivity,
  isTaskModalDebugEnabled,
  logTaskModalDebugFlat,
} from './taskActivity';

interface TaskActivityDiagnosticsOptions {
  taskId: number;
  showAdvancedActivity: boolean;
  historyOpen: boolean;
  historyLoading: boolean;
  historyError: string;
  safeTaskActions: TaskAction[];
  safeTaskMessageCount: number;
  visibleTaskActions: TaskAction[];
  taskStepCount: number;
  subTaskCount: number;
  onAdvancedActivityChange: (enabled: boolean) => void;
}

export function useTaskActivityDiagnostics({
  taskId,
  showAdvancedActivity,
  historyOpen,
  historyLoading,
  historyError,
  safeTaskActions,
  safeTaskMessageCount,
  visibleTaskActions,
  taskStepCount,
  subTaskCount,
  onAdvancedActivityChange,
}: TaskActivityDiagnosticsOptions) {
  const logActivityLayoutSnapshot = useCallback(
    (label: string) => {
      if (!isTaskModalDebugEnabled()) return;

      const actionRows = Array.from(
        document.querySelectorAll(`[data-task-card-id="${taskId}"] [data-task-action-row="true"]`)
      ).map((row, index) => elementSnapshot(`action row ${index + 1}`, row));
      const snapshots = [
        elementSnapshot('modal root', document.querySelector('[data-task-detail-modal="true"]')),
        elementSnapshot('modal panel', document.querySelector('[data-task-detail-panel="true"]')),
        elementSnapshot(
          'modal content',
          document.querySelector('[data-task-detail-content="true"]')
        ),
        elementSnapshot('task card', document.querySelector(`[data-task-card-id="${taskId}"]`)),
        elementSnapshot(
          'activity panel',
          document.querySelector(
            `[data-task-card-id="${taskId}"] [data-task-activity-panel="true"]`
          )
        ),
        ...actionRows,
      ];

      clientLogger.groupCollapsed(
        `[TaskModalDebug] ${label} task=${taskId} advanced=${showAdvancedActivity}`
      );
      clientLogger.table(snapshots);
      clientLogger.groupEnd();
      logTaskModalDebugFlat('layout', { label, taskId, advanced: showAdvancedActivity, snapshots });
    },
    [showAdvancedActivity, taskId]
  );

  const handleAdvancedActivityToggle = useCallback(
    (checked: boolean) => {
      if (isTaskModalDebugEnabled()) {
        const actions = safeTaskActions.map((action, index) => ({
          index,
          id: action.id,
          actionType: action.actionType,
          highImpact: isHighImpactActivity(action),
          createdAt: action.createdAt,
          detailsType: Array.isArray(action.details) ? 'array' : typeof action.details,
          detailKeys: isDetailRecord(action.details) ? Object.keys(action.details).join(',') : '',
          detailSnippet: detailSnippet(action.details),
        }));
        const summary = {
          taskId,
          previousAdvanced: showAdvancedActivity,
          nextAdvanced: checked,
          historyOpen,
          historyLoading,
          taskActions: safeTaskActions.length,
          visibleBeforeToggle: visibleTaskActions.length,
          actions,
        };

        clientLogger.groupCollapsed(`[TaskModalDebug] advanced toggle click task=${taskId}`);
        clientLogger.log(summary);
        clientLogger.table(actions);
        clientLogger.groupEnd();
        logTaskModalDebugFlat('advanced-toggle', summary);
      }

      onAdvancedActivityChange(checked);
    },
    [
      historyLoading,
      historyOpen,
      onAdvancedActivityChange,
      safeTaskActions,
      showAdvancedActivity,
      taskId,
      visibleTaskActions.length,
    ]
  );

  useEffect(() => {
    if (!isTaskModalDebugEnabled()) return;

    const advancedOnlyActions = visibleTaskActions.filter(
      (action) => !isHighImpactActivity(action)
    );
    const hiddenInBasicActions = safeTaskActions
      .filter(
        (action) =>
          !['TASK_CREATED', 'CREATED', 'MANUAL_CREATED'].includes(String(action.actionType || ''))
      )
      .filter((action) => !isHighImpactActivity(action));
    const visibleActions = visibleTaskActions.map((action, index) => ({
      index,
      id: action.id,
      actionType: action.actionType,
      highImpact: isHighImpactActivity(action),
      createdAt: action.createdAt,
      user: action.User?.displayName || 'System',
      detailsType: Array.isArray(action.details) ? 'array' : typeof action.details,
      detailKeys: isDetailRecord(action.details) ? Object.keys(action.details).join(',') : '',
      detailSnippet: detailSnippet(action.details),
    }));
    const summary = {
      taskId,
      historyOpen,
      historyLoading,
      historyError,
      safeTaskActions: safeTaskActions.length,
      safeTaskMessages: safeTaskMessageCount,
      visibleTaskActions: visibleTaskActions.length,
      hiddenInBasicActions: hiddenInBasicActions.length,
      advancedOnlyVisibleActions: advancedOnlyActions.length,
      taskStepCount,
      subTaskCount,
      visibleActions,
    };

    clientLogger.groupCollapsed(
      `[TaskModalDebug] activity state task=${taskId} advanced=${showAdvancedActivity}`
    );
    clientLogger.log(summary);
    clientLogger.table(visibleActions);
    clientLogger.groupEnd();
    logTaskModalDebugFlat('activity-state', { advanced: showAdvancedActivity, ...summary });

    const frame = window.requestAnimationFrame(() =>
      logActivityLayoutSnapshot('layout after render')
    );
    const timer = window.setTimeout(
      () => logActivityLayoutSnapshot('layout 250ms after render'),
      250
    );

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [
    historyError,
    historyLoading,
    historyOpen,
    logActivityLayoutSnapshot,
    safeTaskActions,
    safeTaskMessageCount,
    showAdvancedActivity,
    subTaskCount,
    taskId,
    taskStepCount,
    visibleTaskActions,
  ]);

  return handleAdvancedActivityToggle;
}
