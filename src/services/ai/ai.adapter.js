/**
 * Base Adapter Interface for AI Providers.
 * All adapters must implement these methods.
 */
class AIAdapter {
    /**
     * Classifies text into structured data.
     * @param {string} text - The input text to analyze.
     * @param {Object} context - Additional context (e.g., available categories, member info).
     * @returns {Promise<Object>} - { category, subType, sentiment, summary, ... }
     */
    async classify(text, context = {}) {
        throw new Error('classify() must be implemented by subclass');
    }

    /**
     * Generates a response or summary.
     * @param {string} prompt - The user prompt.
     * @returns {Promise<string>} - The generated text.
     */
    async generate(prompt) {
        throw new Error('generate() must be implemented by subclass');
    }
}

module.exports = AIAdapter;
