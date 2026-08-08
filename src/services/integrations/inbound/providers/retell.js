const { normalizeCallIntake, compactString } = require('../normalizers');

const PROVIDER = 'retell';
const ACTIONABLE_EVENTS = new Set(['call_analyzed']);
const STORED_PASSIVE_EVENTS = new Set(['call_ended']);

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function nestedValue(source, path) {
  return path.reduce((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return current[key];
  }, source);
}

function firstString(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const joined = value.map(item => compactString(item, 300)).filter(Boolean).join('; ');
      if (joined) return joined;
      continue;
    }
    const normalized = compactString(value);
    if (normalized) return normalized;
  }
  return null;
}

function timestampToIso(value) {
  if (!value) return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function calculateDurationSeconds(call) {
  const directSeconds = Number(call.durationSeconds ?? call.duration_seconds ?? call.duration_sec);
  if (Number.isFinite(directSeconds) && directSeconds >= 0) return Math.round(directSeconds);

  const directMs = Number(call.durationMs ?? call.duration_ms);
  if (Number.isFinite(directMs) && directMs >= 0) return Math.round(directMs / 1000);

  const start = Number(call.start_timestamp);
  const end = Number(call.end_timestamp);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return Math.round((end - start) / 1000);
  }

  return null;
}

function buildRetellCallPayload(rawPayload) {
  const call = objectValue(rawPayload.call);
  const callAnalysis = objectValue(call.call_analysis || rawPayload.call_analysis);
  const customAnalysis = objectValue(callAnalysis.custom_analysis_data || rawPayload.custom_analysis_data);
  const metadata = objectValue(call.metadata || rawPayload.metadata);
  const dynamicVariables = objectValue(call.retell_llm_dynamic_variables || rawPayload.retell_llm_dynamic_variables);

  return {
    ...rawPayload,
    provider: PROVIDER,
    call,
    call_analysis: callAnalysis,
    callerName: firstString(
      dynamicVariables.customer_name,
      dynamicVariables.customerName,
      metadata.customer_name,
      metadata.customerName,
      metadata.name
    ),
    callerPhone: firstString(
      call.from_number,
      call.from,
      rawPayload.from_number,
      rawPayload.from
    ),
    callTime: timestampToIso(call.start_timestamp || rawPayload.start_timestamp),
    durationSeconds: calculateDurationSeconds(call),
    summary: firstString(
      callAnalysis.call_summary,
      callAnalysis.summary,
      customAnalysis.summary
    ),
    transcript: firstString(
      call.transcript,
      rawPayload.transcript
    ),
    recordingUrl: firstString(
      call.recording_url,
      rawPayload.recording_url
    ),
    intent: firstString(
      customAnalysis.intent,
      customAnalysis.category,
      customAnalysis.call_category,
      callAnalysis.call_successful === false ? 'callback request' : null
    ),
    urgency: firstString(
      customAnalysis.urgency,
      customAnalysis.priority
    ),
    recommendedAction: firstString(
      customAnalysis.recommended_action,
      customAnalysis.recommendedAction,
      customAnalysis.next_step,
      customAnalysis.nextStep,
      callAnalysis.action_items
    ),
    externalCallId: firstString(
      call.call_id,
      rawPayload.call_id
    ),
    metadata: {
      retellEvent: firstString(rawPayload.event, rawPayload.event_type),
      agentId: firstString(call.agent_id, rawPayload.agent_id),
      callStatus: firstString(call.call_status, rawPayload.call_status),
      callType: firstString(call.call_type, rawPayload.call_type),
      direction: firstString(call.direction, rawPayload.direction),
      accountId: firstString(metadata.accountId, metadata.account_id),
      locationId: firstString(metadata.locationId, metadata.location_id),
      optOutSensitiveDataStorage: Boolean(call.opt_out_sensitive_data_storage)
    }
  };
}

function buildRetellIntegrationEvent(rawPayload = {}) {
  const retellEvent = firstString(rawPayload.event, rawPayload.event_type) || 'unknown';
  const callPayload = buildRetellCallPayload(rawPayload);
  const externalCallId = callPayload.externalCallId;

  if (!externalCallId) {
    return {
      shouldStore: false,
      reason: 'missing_call_id',
      retellEvent
    };
  }

  const shouldQueueForReview = ACTIONABLE_EVENTS.has(retellEvent);
  const shouldStorePassive = STORED_PASSIVE_EVENTS.has(retellEvent);
  if (!shouldQueueForReview && !shouldStorePassive) {
    return {
      shouldStore: false,
      reason: 'non_actionable_event',
      retellEvent,
      externalCallId
    };
  }

  const normalizedPayload = normalizeCallIntake(callPayload, {
    provider: PROVIDER,
    externalEventId: externalCallId
  });
  normalizedPayload.metadata = {
    ...(normalizedPayload.metadata || {}),
    ...(callPayload.metadata || {})
  };

  return {
    shouldStore: true,
    retellEvent,
    externalCallId,
    event: {
      provider: PROVIDER,
      intakeMethod: 'webhook',
      eventType: shouldQueueForReview ? 'call.intake' : 'unknown.received',
      externalEventId: `${externalCallId}:${retellEvent}`,
      rawPayload,
      normalizedPayload,
      metadata: {
        provider: PROVIDER,
        retellEvent,
        externalCallId,
        actionable: shouldQueueForReview,
        accountId: firstString(callPayload.metadata?.accountId, nestedValue(rawPayload, ['call', 'metadata', 'accountId'])),
        locationId: firstString(callPayload.metadata?.locationId, nestedValue(rawPayload, ['call', 'metadata', 'locationId']))
      }
    }
  };
}

module.exports = {
  ACTIONABLE_EVENTS,
  STORED_PASSIVE_EVENTS,
  buildRetellIntegrationEvent
};
