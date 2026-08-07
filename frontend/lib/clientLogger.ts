const isDevelopment = process.env.NODE_ENV !== 'production';

export const clientLogger = {
    debug: (...args: unknown[]) => {
        if (isDevelopment) console.debug(...args);
    },
    info: (...args: unknown[]) => {
        if (isDevelopment) console.info(...args);
    },
    log: (...args: unknown[]) => {
        if (isDevelopment) console.log(...args);
    },
    warn: (...args: unknown[]) => {
        if (isDevelopment) console.warn(...args);
    },
    error: (...args: unknown[]) => {
        if (isDevelopment) console.error(...args);
    },
    groupCollapsed: (...args: unknown[]) => {
        if (isDevelopment) console.groupCollapsed(...args);
    },
    groupEnd: () => {
        if (isDevelopment) console.groupEnd();
    },
    table: (data: unknown) => {
        if (isDevelopment) console.table(data);
    }
};
