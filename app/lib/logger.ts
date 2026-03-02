// Centralized logger utility
// Prevents console statements in production while maintaining dev debugging

const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  /**
   * Log informational messages (dev only)
   */
  info: (...args: unknown[]) => {
    if (isDev) {
      console.info('[INFO]', ...args);
    }
  },

  /**
   * Log warnings (always shown)
   */
  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...args);
  },

  /**
   * Log errors (always shown)
   */
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
  },

  /**
   * Debug logs (dev only)
   */
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Performance timing (dev only)
   */
  time: (label: string) => {
    if (isDev) {
      console.time(`[TIME] ${label}`);
    }
  },

  /**
   * End performance timing (dev only)
   */
  timeEnd: (label: string) => {
    if (isDev) {
      console.timeEnd(`[TIME] ${label}`);
    }
  },
};
