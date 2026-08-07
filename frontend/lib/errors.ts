export function errorMessage(error: unknown, fallback = 'An unexpected error occurred') {
    return error instanceof Error && error.message ? error.message : fallback;
}
