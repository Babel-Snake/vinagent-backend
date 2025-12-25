const AppError = require('./AppError');

class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404, 'NOT_FOUND');
    }
}

class ValidationError extends AppError {
    constructor(message = 'Validation failed', details = null) {
        super(message, 400, 'VALIDATION_ERROR', details);
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'Not authenticated') {
        super(message, 401, 'UNAUTHENTICATED');
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'Access denied') {
        super(message, 403, 'FORBIDDEN');
    }
}

module.exports = {
    AppError,
    NotFoundError,
    ValidationError,
    AuthenticationError,
    ForbiddenError
};
