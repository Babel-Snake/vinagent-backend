const METRICS = Object.freeze({
  SEAT_ACTIVATED: 'seat.activated',
  SEAT_DEACTIVATED: 'seat.deactivated',
  ACTIVE_SEATS: 'seat.active',
  USER_ENGAGED_SECONDS: 'user.engaged_seconds',
  API_REQUESTS: 'api.requests',
  TASK_CREATED: 'task.created',
  MESSAGE_RECEIVED: 'message.received',
  MESSAGE_SENT: 'message.sent',
  AI_REQUEST: 'ai.request',
  AI_INPUT_TOKENS: 'ai.input_tokens',
  AI_OUTPUT_TOKENS: 'ai.output_tokens',
  AI_TOTAL_TOKENS: 'ai.total_tokens',
  ATTACHMENT_UPLOADED_BYTES: 'attachment.uploaded_bytes',
  ATTACHMENT_DELETED_BYTES: 'attachment.deleted_bytes',
  ATTACHMENT_STORAGE_BYTES: 'attachment.storage_bytes',
  AUTOMATION_EXECUTED: 'automation.executed',
  ACTIVE_MEMBERS: 'member.active'
});

const METRIC_DEFINITIONS = Object.freeze({
  [METRICS.SEAT_ACTIVATED]: { unit: 'seats', dimensions: ['role'] },
  [METRICS.SEAT_DEACTIVATED]: { unit: 'seats', dimensions: ['role'] },
  [METRICS.ACTIVE_SEATS]: { unit: 'seats', dimensions: [] },
  [METRICS.USER_ENGAGED_SECONDS]: { unit: 'seconds', dimensions: ['routeGroup', 'authMode'] },
  [METRICS.API_REQUESTS]: {
    unit: 'requests',
    dimensions: ['routeGroup', 'method', 'statusClass', 'role', 'authMode']
  },
  [METRICS.TASK_CREATED]: { unit: 'tasks', dimensions: ['source', 'category', 'automation'] },
  [METRICS.MESSAGE_RECEIVED]: { unit: 'messages', dimensions: ['channel', 'provider'] },
  [METRICS.MESSAGE_SENT]: { unit: 'messages', dimensions: ['channel', 'provider', 'result'] },
  [METRICS.AI_REQUEST]: { unit: 'calls', dimensions: ['provider', 'model', 'operation', 'result'] },
  [METRICS.AI_INPUT_TOKENS]: { unit: 'tokens', dimensions: ['provider', 'model', 'operation'] },
  [METRICS.AI_OUTPUT_TOKENS]: { unit: 'tokens', dimensions: ['provider', 'model', 'operation'] },
  [METRICS.AI_TOTAL_TOKENS]: { unit: 'tokens', dimensions: ['provider', 'model', 'operation'] },
  [METRICS.ATTACHMENT_UPLOADED_BYTES]: { unit: 'bytes', dimensions: ['entityType', 'mimeGroup'] },
  [METRICS.ATTACHMENT_DELETED_BYTES]: { unit: 'bytes', dimensions: ['entityType', 'mimeGroup'] },
  [METRICS.ATTACHMENT_STORAGE_BYTES]: { unit: 'bytes', dimensions: [] },
  [METRICS.AUTOMATION_EXECUTED]: { unit: 'executions', dimensions: ['automationType', 'result'] },
  [METRICS.ACTIVE_MEMBERS]: { unit: 'members', dimensions: [] }
});

const ROUTE_GROUPS = new Set([
  'analytics', 'attachments', 'automations', 'calendar', 'integration-events', 'members', 'notifications',
  'operational-areas', 'operations', 'projects', 'requests', 'staff', 'tasks', 'usage', 'users',
  'winery', 'other'
]);

module.exports = {
  METRICS,
  METRIC_DEFINITIONS,
  ROUTE_GROUPS
};
