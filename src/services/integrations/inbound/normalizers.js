const CALL_CATEGORIES = new Set([
  'booking_enquiry',
  'wine_club_enquiry',
  'customer_complaint',
  'supplier_call',
  'wholesale_enquiry',
  'callback_request',
  'event_enquiry',
  'opening_hours',
  'urgent_operational_issue',
  'unknown'
]);

const NOTICE_CATEGORIES = new Set([
  'GENERAL',
  'WINE',
  'VINTAGE_CHANGE',
  'PRICING',
  'STOCK',
  'CUSTOMERS',
  'MAINTENANCE',
  'EVENTS',
  'STAFF',
  'WINE_CLUB',
  'URGENT'
]);

function compactString(value, maxLength = 1000) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function firstString(...values) {
  for (const value of values) {
    const normalized = compactString(value);
    if (normalized) return normalized;
  }
  return null;
}

function nestedValue(source, path) {
  return path.reduce((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return current[key];
  }, source);
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseDurationSeconds(raw) {
  const direct = Number(raw.durationSeconds ?? raw.duration_seconds ?? raw.duration_sec);
  if (Number.isFinite(direct) && direct >= 0) return Math.round(direct);

  const milliseconds = Number(raw.durationMs ?? raw.duration_ms ?? nestedValue(raw, ['call', 'duration_ms']));
  if (Number.isFinite(milliseconds) && milliseconds >= 0) return Math.round(milliseconds / 1000);

  return null;
}

function slugifyCategory(value) {
  const normalized = compactString(value, 100);
  if (!normalized) return 'unknown';
  const slug = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (CALL_CATEGORIES.has(slug)) return slug;

  if (slug.includes('booking') || slug.includes('reservation')) return 'booking_enquiry';
  if (slug.includes('club')) return 'wine_club_enquiry';
  if (slug.includes('complaint') || slug.includes('angry')) return 'customer_complaint';
  if (slug.includes('supplier')) return 'supplier_call';
  if (slug.includes('wholesale') || slug.includes('trade')) return 'wholesale_enquiry';
  if (slug.includes('callback') || slug.includes('call_back')) return 'callback_request';
  if (slug.includes('event')) return 'event_enquiry';
  if (slug.includes('hours') || slug.includes('opening')) return 'opening_hours';
  if (slug.includes('urgent') || slug.includes('operational')) return 'urgent_operational_issue';

  return 'unknown';
}

function normalizeUrgency(value) {
  const normalized = compactString(value, 50);
  if (!normalized) return 'normal';
  const lower = normalized.toLowerCase();
  if (['urgent', 'high', 'critical'].includes(lower)) return 'urgent';
  if (['low', 'minor'].includes(lower)) return 'low';
  return 'normal';
}

function normalizeNoticeCategory(value, fallbackBody = '') {
  const direct = compactString(value, 80);
  if (direct) {
    const upper = direct.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (NOTICE_CATEGORIES.has(upper)) return upper;
  }

  const text = `${direct || ''} ${fallbackBody || ''}`.toLowerCase();
  if (text.includes('urgent')) return 'URGENT';
  if (text.includes('staff') || text.includes('shift') || text.includes('roster')) return 'STAFF';
  if (text.includes('stock') || text.includes('delivery')) return 'STOCK';
  if (text.includes('event')) return 'EVENTS';
  if (text.includes('price')) return 'PRICING';
  if (text.includes('maintenance') || text.includes('repair')) return 'MAINTENANCE';

  return 'GENERAL';
}

function normalizeNoticePriority(value, body = '') {
  const text = `${value || ''} ${body || ''}`.toLowerCase();
  if (text.includes('urgent') || text.includes('critical')) return 'urgent';
  if (text.includes('important') || text.includes('priority')) return 'important';
  return 'normal';
}

function normalizeCallIntake(rawPayload = {}, context = {}) {
  const call = rawPayload.call || {};
  const callAnalysis = rawPayload.call_analysis || rawPayload.callAnalysis || {};

  const summary = firstString(
    rawPayload.summary,
    rawPayload.callSummary,
    rawPayload.call_summary,
    call.summary,
    callAnalysis.call_summary,
    callAnalysis.summary
  );
  const transcript = firstString(
    rawPayload.transcript,
    rawPayload.TranscriptionText,
    rawPayload.transcription,
    call.transcript
  );
  const category = slugifyCategory(firstString(
    rawPayload.intent,
    rawPayload.category,
    rawPayload.callCategory,
    rawPayload.call_category,
    callAnalysis.intent,
    callAnalysis.category
  ));

  return {
    provider: context.provider,
    callerName: firstString(
      rawPayload.callerName,
      rawPayload.caller_name,
      rawPayload.customerName,
      rawPayload.customer_name,
      nestedValue(call, ['customer', 'name'])
    ),
    callerPhone: firstString(
      rawPayload.callerPhone,
      rawPayload.caller_phone,
      rawPayload.From,
      rawPayload.from,
      rawPayload.phone,
      call.from_number,
      call.from
    ),
    callTime: parseDate(
      rawPayload.callTime
      || rawPayload.startedAt
      || rawPayload.started_at
      || rawPayload.startTime
      || rawPayload.start_time
      || call.start_timestamp
    ),
    durationSeconds: parseDurationSeconds(rawPayload),
    summary,
    transcript,
    recordingUrl: firstString(
      rawPayload.recordingUrl,
      rawPayload.RecordingUrl,
      rawPayload.recording_url,
      call.recording_url
    ),
    category,
    urgency: normalizeUrgency(firstString(
      rawPayload.urgency,
      rawPayload.priority,
      callAnalysis.urgency,
      category === 'urgent_operational_issue' ? 'urgent' : null
    )),
    recommendedAction: firstString(
      rawPayload.recommendedAction,
      rawPayload.recommended_action,
      rawPayload.nextStep,
      rawPayload.next_step,
      callAnalysis.recommended_action
    ),
    externalCallId: firstString(
      rawPayload.externalCallId,
      rawPayload.callId,
      rawPayload.call_id,
      rawPayload.CallSid,
      call.call_id,
      context.externalEventId
    ),
    metadata: {
      sourceEventType: rawPayload.event_type || rawPayload.eventType || null,
      to: firstString(rawPayload.To, rawPayload.to, call.to_number, call.to),
      disconnectedReason: firstString(rawPayload.disconnected_reason, call.disconnected_reason)
    }
  };
}

function normalizeImportedNotice(rawPayload = {}, context = {}) {
  const notice = rawPayload.notice || {};
  const body = firstString(
    rawPayload.body,
    rawPayload.message,
    rawPayload.text,
    rawPayload.content,
    notice.body,
    notice.message,
    notice.text
  );

  return {
    provider: context.provider,
    title: firstString(
      rawPayload.title,
      rawPayload.subject,
      notice.title,
      notice.subject,
      body ? body.slice(0, 80) : null
    ),
    body,
    category: normalizeNoticeCategory(rawPayload.category || notice.category, body),
    priority: normalizeNoticePriority(rawPayload.priority || notice.priority, body),
    postedAt: parseDate(
      rawPayload.postedAt
      || rawPayload.posted_at
      || rawPayload.createdAt
      || rawPayload.created_at
      || notice.postedAt
      || notice.created_at
    ),
    externalAuthorName: firstString(
      rawPayload.authorName,
      rawPayload.author_name,
      rawPayload.postedBy,
      rawPayload.posted_by,
      rawPayload.userName,
      rawPayload.user_name,
      nestedValue(rawPayload, ['author', 'name']),
      nestedValue(rawPayload, ['user', 'name'])
    ),
    externalNoticeId: firstString(
      rawPayload.externalNoticeId,
      rawPayload.noticeId,
      rawPayload.notice_id,
      rawPayload.id,
      notice.id,
      context.externalEventId
    ),
    sourceLabel: firstString(rawPayload.sourceLabel, rawPayload.source, context.provider),
    metadata: {
      audience: rawPayload.audience || notice.audience || null,
      attachments: Array.isArray(rawPayload.attachments) ? rawPayload.attachments : []
    }
  };
}

function normalizeInboundEvent({ eventType, rawPayload, provider, externalEventId }) {
  const context = { provider, externalEventId };

  if (eventType === 'call.intake') {
    return normalizeCallIntake(rawPayload, context);
  }

  if (eventType === 'notice.imported') {
    return normalizeImportedNotice(rawPayload, context);
  }

  return rawPayload || {};
}

module.exports = {
  normalizeInboundEvent,
  normalizeCallIntake,
  normalizeImportedNotice,
  compactString
};
