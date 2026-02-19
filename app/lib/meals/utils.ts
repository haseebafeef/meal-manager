import { RAMADAN_CONFIG } from '@/app/lib/constants';

export function isSahriActive(date: Date): boolean {
    const d = new Date(date);
    // Normalize to check range
    return d >= new Date(RAMADAN_CONFIG.START) && d <= new Date(RAMADAN_CONFIG.END);
}
