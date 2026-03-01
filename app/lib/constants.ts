export const CUTOFF_TIMES = {
    LUNCH: '11:00', // 11:00 AM
    DINNER: '13:00', // 1:00 PM
    SAHRI: '18:00', // 6:00 PM (prior evening: Sahri booking closes the evening before)
};

// Update these dates for next year's Ramadan.
// END is set to end-of-day Dhaka time on the last Ramadan day.
// Since Dhaka is UTC+6, 23:59:59 Dhaka = 17:59:59 UTC.
// This ensures the last Sahri night (midnight Dhaka = 18:00 UTC previous day) is within range.
export const RAMADAN_CONFIG = {
    START: '2026-02-17T00:00:00Z', // Start of first Sahri (UTC)
    END: '2026-03-21T17:59:59Z',   // End of last Sahri day in Dhaka (23:59:59 Dhaka = 17:59:59 UTC)
};

export const SETTINGS_KEYS = {
    LUNCH_CUTOFF: 'LUNCH_CUTOFF_TIME',
    DINNER_CUTOFF: 'DINNER_CUTOFF_TIME',
    MEAL_RATE: 'CURRENT_MEAL_RATE',
    PREV_MEAL_RATE: 'PREVIOUS_MEAL_RATE',
    PREV_MEAL_RATE_SOURCE: 'PREV_MEAL_RATE_SOURCE', // 'auto' | 'override'
    AUTO_OFF_THRESHOLD: 'AUTO_OFF_THRESHOLD',
    REPORT_DELIVERY_TIME: 'REPORT_DELIVERY_TIME',
    LAST_DELIVERY_ISO: 'LAST_DELIVERY_ISO',
    SAHRI_CUTOFF: 'SAHRI_CUTOFF_TIME'
};

export const DEFAULT_SETTINGS = {
    [SETTINGS_KEYS.LUNCH_CUTOFF]: '11:00',
    [SETTINGS_KEYS.DINNER_CUTOFF]: '13:00',
    [SETTINGS_KEYS.SAHRI_CUTOFF]: '18:00',
    [SETTINGS_KEYS.MEAL_RATE]: '70',
    [SETTINGS_KEYS.PREV_MEAL_RATE]: '70',
    [SETTINGS_KEYS.AUTO_OFF_THRESHOLD]: '-500',
    [SETTINGS_KEYS.REPORT_DELIVERY_TIME]: '10:00',
};

/** App went live in February 2026 — used as the floor for all historical aggregations. */
export const APP_LAUNCH = { year: 2026, month: 2 }; // month is 1-indexed

/** UTC midnight of the first day of the launch month — used as a lower-bound for DB queries. */
export const APP_LAUNCH_UTC = new Date(Date.UTC(APP_LAUNCH.year, APP_LAUNCH.month - 1, 1));
