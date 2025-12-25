class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;

        // Capture stack trace
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
