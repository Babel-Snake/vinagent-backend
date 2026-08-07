const TYPES = new Set(['TASK', 'NOTICE', 'REQUEST', 'NOTE']);

function normalizeConfidence(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, Number(number.toFixed(4))));
}

function classifyOperationalType(text, aiResult = {}) {
  const explicitType = String(aiResult.suggestedType || aiResult.operationalType || '').toUpperCase();
  if (TYPES.has(explicitType)) {
    return {
      suggestedType: explicitType,
      confidence: normalizeConfidence(aiResult.confidence ?? aiResult.operationalConfidence, 0.75),
      classificationSource: 'AI'
    };
  }

  const body = String(text || '').trim().toLowerCase();
  const matches = (pattern) => pattern.test(body);

  if (matches(/\b(can|could|would)\s+(we|you|someone)\b|\bcan someone\b|\bplease approve\b|\bneed(s|ed)?\s+(approval|help|support|permission|more)\b|\bwe need\b|\brequest(?:ing)?\b/)) {
    return { suggestedType: 'REQUEST', confidence: 0.88, classificationSource: 'RULE' };
  }

  if (matches(/^(call|send|check|order|prepare|restock|follow up|contact|book|confirm|review|investigate|create|update)\b|\b(before|by)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|\d)/)) {
    return { suggestedType: 'TASK', confidence: 0.86, classificationSource: 'RULE' };
  }

  if (matches(/\b(starts?|effective|closed|unavailable|arriving|must use|please note|be advised|until .* use|new policy|new tasting|room is unavailable)\b/)) {
    return { suggestedType: 'NOTICE', confidence: 0.82, classificationSource: 'RULE' };
  }

  if (matches(/\b(froze|crashed|complained|mentioned|arrived|happened|was |were |seemed|running low|damaged|asked whether|ran \d+|observed)\b/)) {
    return { suggestedType: 'NOTE', confidence: 0.83, classificationSource: 'RULE' };
  }

  return { suggestedType: 'NOTE', confidence: 0.58, classificationSource: 'RULE' };
}

module.exports = { classifyOperationalType, normalizeConfidence };
