const { ValidationError } = require('../utils/errors');

class ContextPackRegistry {
  constructor() {
    this.packs = new Map();
  }

  register({ name, description, inputSchema, outputSchema, resolver }) {
    const normalizedName = String(name || '').trim().toLowerCase();
    if (!normalizedName) throw new Error('Context pack name is required.');
    if (typeof resolver !== 'function') throw new Error(`Context pack '${normalizedName}' requires a resolver.`);
    if (this.packs.has(normalizedName)) return this.packs.get(normalizedName);
    const definition = Object.freeze({
      name: normalizedName,
      description,
      inputSchema,
      outputSchema,
      resolver
    });
    this.packs.set(normalizedName, definition);
    return definition;
  }

  get(name) {
    return this.packs.get(String(name || '').trim().toLowerCase()) || null;
  }

  list() {
    return [...this.packs.values()].map(pack => ({
      name: pack.name,
      description: pack.description,
      input: pack.inputSchema?.describe ? pack.inputSchema.describe() : null,
      output: pack.outputSchema?.describe ? pack.outputSchema.describe() : null
    }));
  }

  async resolve(name, { input = {}, ...context } = {}) {
    const definition = this.get(name);
    if (!definition) throw new ValidationError(`Context pack '${name}' is not registered.`);
    const validatedInput = definition.inputSchema
      ? definition.inputSchema.validate(input, { abortEarly: false, convert: true })
      : { value: input };
    if (validatedInput.error) {
      throw new ValidationError(`Invalid input for context pack '${name}'.`, validatedInput.error.details);
    }
    const output = await definition.resolver({ ...context, input: validatedInput.value });
    if (!definition.outputSchema) return output;
    const validatedOutput = definition.outputSchema.validate(output, { abortEarly: false, convert: false });
    if (validatedOutput.error) {
      throw new ValidationError(`Context pack '${name}' returned an invalid result.`, validatedOutput.error.details);
    }
    return validatedOutput.value;
  }
}

module.exports = new ContextPackRegistry();
