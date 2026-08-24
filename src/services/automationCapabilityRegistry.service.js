const { ValidationError } = require('../utils/errors');

class AutomationCapabilityRegistry {
  constructor() {
    this.capabilities = new Map();
  }

  register({ name, description, kind = 'READ', inputSchema = null, outputSchema = null, handler, availability = null }) {
    const normalizedName = String(name || '').trim().toLowerCase();
    if (!normalizedName) throw new Error('Capability name is required.');
    if (typeof handler !== 'function') throw new Error(`Capability '${normalizedName}' requires a handler.`);
    if (this.capabilities.has(normalizedName)) return this.capabilities.get(normalizedName);
    const definition = { name: normalizedName, description, kind, inputSchema, outputSchema, handler, availability };
    this.capabilities.set(normalizedName, definition);
    return definition;
  }

  has(name) {
    return this.capabilities.has(String(name || '').toLowerCase());
  }

  get(name) {
    return this.capabilities.get(String(name || '').toLowerCase()) || null;
  }

  async list(context = {}) {
    const results = [];
    for (const definition of this.capabilities.values()) {
      let availability = { available: true, code: 'REGISTERED' };
      if (definition.availability) {
        try {
          availability = await definition.availability(context);
        } catch (err) {
          availability = { available: false, code: err.code || 'AVAILABILITY_CHECK_FAILED' };
        }
      }
      results.push({
        name: definition.name,
        description: definition.description,
        kind: definition.kind,
        availability,
        input: definition.inputSchema?.describe ? definition.inputSchema.describe() : null,
        output: definition.outputSchema?.describe ? definition.outputSchema.describe() : null
      });
    }
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async execute(name, { input = {}, ...context } = {}) {
    const definition = this.get(name);
    if (!definition) throw new ValidationError(`Automation capability '${name}' is not registered.`);
    if (definition.kind !== 'READ') {
      throw new ValidationError(`Capability '${name}' cannot be used as an unattended enrichment tool.`);
    }
    const validatedInput = definition.inputSchema
      ? definition.inputSchema.validate(input, { abortEarly: false, convert: true })
      : { value: input };
    if (validatedInput.error) {
      throw new ValidationError(`Invalid input for capability '${name}'.`, validatedInput.error.details);
    }
    const output = await definition.handler({ ...context, input: validatedInput.value });
    if (definition.outputSchema) {
      const validatedOutput = definition.outputSchema.validate(output, { abortEarly: false, convert: false });
      if (validatedOutput.error) {
        throw new ValidationError(`Capability '${name}' returned an invalid result.`, validatedOutput.error.details);
      }
      return validatedOutput.value;
    }
    return output;
  }
}

module.exports = new AutomationCapabilityRegistry();
