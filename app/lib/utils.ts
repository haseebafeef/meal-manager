import { startOfMonth, addHours } from 'date-fns';

export const DHAKA_OFFSET_HOURS = 6;

/**
 * Returns the current date shifted to Dhaka time (UTC+6).
 * Use this to determine "Today" or "Current Month" relative to Dhaka.
 */
export function getNowDhaka() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
    });

    // Check if parts are available (robustness)
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => {
        const p = parts.find(p => p.type === type);
        return p ? parseInt(p.value) : 0;
    };

    const y = getPart('year');
    const m = getPart('month') - 1; // JS Date is 0-indexed
    const d = getPart('day');

    // Handle potential "24" hour edge case if any (unlikely with en-US numeric) or just normal parse
    let h = getPart('hour');
    if (h === 24) h = 0;

    const min = getPart('minute');
    const s = getPart('second');

    return new Date(Date.UTC(y, m, d, h, min, s));
}

/**
 * Returns the start of the current month in Dhaka time.
 */
export function getStartOfMonthDhaka() {
    const nowDhaka = getNowDhaka();
    return startOfMonth(nowDhaka);
}

/**
 * Formats a date string/object to a readable date-time string in Dhaka Time
 */
export function formatDhakaDateTime(date: Date | string) {
    const d = new Date(date);
    const dhakaDate = addHours(d, DHAKA_OFFSET_HOURS);

    // We remove the 'Z' (UTC) indicator implicitly by formatting 
    // but the inputs are treated as UTC, shifted by 6h, then formatted.
    // If we rely on ISO string slice, we get the "Dhaka Face Value".

    return dhakaDate.toISOString().replace('T', ' ').substring(0, 19);
}

export function formatUserName(user: { id: string; name: string | null; nickname: string | null; status: string }) {
    if (user.status === 'Deleted') {
        return `Deleted User #${user.id.slice(-4)}`;
    }
    return user.nickname || user.name || 'Unknown';
}
