'use server';

import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { endOfMonth, addMonths, endOfDay } from 'date-fns';
import { getNowDhaka, formatUserName } from '@/app/lib/utils';
import { getSystemSettings } from '@/app/lib/settings-actions';
import { SETTINGS_KEYS } from '@/app/lib/constants';
import { isSahriActive } from './utils';

export async function getMealStatus(targetUserId?: string) {
    const session = await auth();
    if (!session?.user) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userId = (session.user as any).id;
    if (!userId && session.user.email) {
        const user = await prisma.user.findFirst({
            where: { email: session.user.email }
        });
        userId = user?.id;
    }

    // Admin Override Logic
    if (targetUserId) {
        const currentUser = await prisma.user.findUnique({ where: { id: userId } });
        if (currentUser?.isAdmin) {
            userId = targetUserId;
        } else {
            return [];
        }
    }

    if (!userId) return [];

    const now = new Date();
    // Fetch from system epoch (Feb 1, 2026) to ensure past history is always returned
    const systemEpoch = new Date(Date.UTC(2026, 1, 1));
    const start = systemEpoch;
    const end = endOfMonth(addMonths(now, 6));

    const statuses = await prisma.mealStatus.findMany({
        where: {
            userId: userId,
            date: {
                gte: start,
                lte: end,
            },
        },
    });

    return statuses;
}

export async function getDailyMealStats(date?: Date) {
    // If a specific date is provided, shift it to Dhaka. Otherwise use common nowDhaka.
    const baseDate = date ? new Date(date.toLocaleString("en-US", { timeZone: "Asia/Dhaka" })) : getNowDhaka();
    const targetDate = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate()));

    const allUsers = await prisma.user.findMany({
        select: {
            id: true,
            name: true,
            nickname: true,
            status: true,
            defaultLunchStatus: true,
            defaultDinnerStatus: true,
            defaultSahriStatus: true
        }
    });

    const meals = await prisma.mealStatus.findMany({
        where: {
            date: targetDate
        }
    });

    const stats = {
        lunch: {
            count: 0,
            users: [] as string[]
        },
        dinner: {
            count: 0,
            users: [] as string[]
        },
        sahri: {
            count: 0,
            users: [] as string[]
        }
    };

    // Create a map for quick access
    const mealMap = new Map(meals.map(m => [m.userId, m]));

    allUsers.forEach(user => {
        const status = mealMap.get(user.id);
        const isActive = user.status === 'Active';

        // Only include if Active OR has explicit record
        if (!isActive && !status) return;

        const displayName = formatUserName(user);

        // Default Logic: If no record, use User Preference
        const defaultLunch = user.defaultLunchStatus ? 1 : 0;
        const defaultDinner = user.defaultDinnerStatus ? 1 : 0;

        // Sahri Default only if active date?
        // getDailyMealStats is for a specific date (usually today).
        const isSahri = isSahriActive(targetDate);
        const defaultSahri = (isSahri && user.defaultSahriStatus) ? 1 : 0;

        const lunchCount = status ? status.lunch : defaultLunch;
        const dinnerCount = status ? status.dinner : defaultDinner;

        const sahriCount = status ? status.sahri : defaultSahri;

        if (lunchCount > 0) {
            stats.lunch.count += lunchCount;
            const label = lunchCount > 1 ? `${displayName} (${lunchCount})` : displayName;
            stats.lunch.users.push(label);
        }
        if (dinnerCount > 0) {
            stats.dinner.count += dinnerCount;
            const label = dinnerCount > 1 ? `${displayName} (${dinnerCount})` : displayName;
            stats.dinner.users.push(label);
        }
        if (sahriCount > 0) {
            stats.sahri.count += sahriCount;
            const label = sahriCount > 1 ? `${displayName} (${sahriCount})` : displayName;
            stats.sahri.users.push(label);
        }
    });

    return stats;
}

export async function getMonthlyMealHistory(year: number, month: number) {
    // Use strict UTC dates to avoid timezone shifts
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 0)); // Last day of the month in UTC

    // Get all users (Active & Inactive) to calculate history correctly based on time
    // First, find all user IDs that have meal records within the month
    const userIdsInMeals = (await prisma.mealStatus.findMany({
        where: {
            date: {
                gte: start,
                lte: end
            }
        },
        select: {
            userId: true
        },
        distinct: ['userId']
    })).map(m => m.userId);

    const allUsers = await prisma.user.findMany({
        where: {
            OR: [
                { status: 'Active' },
                { id: { in: userIdsInMeals } }
            ]
        },
        select: {
            id: true,
            name: true,
            nickname: true,
            status: true,
            statusLogs: {
                orderBy: { changedAt: 'asc' }
            },
            createdAt: true,
            defaultLunchStatus: true,
            defaultDinnerStatus: true,

            defaultSahriStatus: true
        }
    });

    // Fetch meal statuses for the month
    const meals = await prisma.mealStatus.findMany({
        where: {
            date: {
                gte: start,
                lte: end
            }
        }
    });

    // Create a map for quick access: date_userId -> status
    // Key format: YYYY-MM-DD_userId
    const mealMap = new Map();
    meals.forEach(m => {
        const dateKey = m.date.toISOString().split('T')[0];
        mealMap.set(`${dateKey}_${m.userId}`, m);
    });

    // Fetch settings for dynamic cutoff check
    const settings = await getSystemSettings();
    const lunchCutoffStr = settings?.[SETTINGS_KEYS.LUNCH_CUTOFF] || '11:00';
    const dinnerCutoffStr = settings?.[SETTINGS_KEYS.DINNER_CUTOFF] || '13:00';

    const [lH, lM] = lunchCutoffStr.split(':').map(Number);
    const [dH, dM] = dinnerCutoffStr.split(':').map(Number);
    const lunchCutoffMins = lH * 60 + lM;
    const dinnerCutoffMins = dH * 60 + dM;

    // Determine current time in Dhaka
    const nowDhaka = getNowDhaka();

    // Calculate history based on Dhaka-relative days.
    // Meals are bucketed by face-value days, matching local consumption patterns.
    const history = [];
    const current = new Date(start);

    // Business rule helper to determine if a record represents a past, today, or future event.
    const isDayPast = (d: Date) => {
        // d is UTC midnight.
        const todayUTC = new Date(Date.UTC(nowDhaka.getUTCFullYear(), nowDhaka.getUTCMonth(), nowDhaka.getUTCDate()));

        if (d.getTime() < todayUTC.getTime()) return 'PAST';
        if (d.getTime() > todayUTC.getTime()) return 'FUTURE';
        return 'TODAY';
    };

    const currentMins = nowDhaka.getUTCHours() * 60 + nowDhaka.getUTCMinutes();

    // --- Calculate User Activation Date ---
    // Rule: User is inactive until their First Meal Order (lunch>0 or dinner>0) 
    // OR until they have a historical Snapshot (Legacy/Billed users).

    // 1. First Meal Dates
    const firstMeals = await prisma.mealStatus.groupBy({
        by: ['userId'],
        _min: { date: true },
        where: {
            OR: [
                { lunch: { gt: 0 } },
                { dinner: { gt: 0 } }
            ]
        }
    });

    // 2. First Snapshot Dates (Billing History)
    // Snapshots store 'year' and 'month' (String YYYY-MM). We need to convert.
    // groupBy might not be sufficient if we need to parse fields, but we can fetch min year/month logic?
    // Optimization: Just fetch all snapshot 'month' keys per user?
    const snapshots = await prisma.monthlySnapshot.groupBy({
        by: ['userId'],
        _min: { month: true } // "2025-01" sorts correctly as string
    });

    const activationMap = new Map<string, Date>();

    firstMeals.forEach(fm => {
        if (fm._min.date) {
            activationMap.set(fm.userId, fm._min.date);
        }
    });

    snapshots.forEach(sn => {
        if (sn._min.month) {
            const [y, m] = sn._min.month.split('-').map(Number);
            const snapDate = new Date(Date.UTC(y, m - 1, 1)); // First day of billed month

            const existing = activationMap.get(sn.userId);
            if (!existing || snapDate < existing) {
                activationMap.set(sn.userId, snapDate);
            }
        }
    });



    while (current <= end) {
        const dateKey = current.toISOString().split('T')[0];
        let lunchCount = 0;
        let dinnerCount = 0;
        let sahriCount = 0;
        let passedLunchCount = 0;
        let passedDinnerCount = 0;
        let passedSahriCount = 0;

        let dailyTotalUsers = 0;
        const lunchUsers: string[] = [];
        const dinnerUsers: string[] = [];
        const sahriUsers: string[] = [];

        const dayState = isDayPast(current);

        // Define end of this reporting day for log comparison
        const dayEnd = endOfDay(current);

        allUsers.forEach(user => {
            const key = `${dateKey}_${user.id}`;
            const status = mealMap.get(key);

            // 1. Creation Check
            const nextDay = new Date(current);
            nextDay.setUTCDate(current.getUTCDate() + 1);
            if (user.createdAt >= nextDay && !status) return;

            // 2. Activation Check (First Order Rule)
            const activationDate = activationMap.get(user.id);
            // If user has NO activation date -> They never ordered -> Skip
            // UNLESS they have a status record for THIS day (Edge case: they ordered 0 meals? Treated as interaction?)
            // But if status exists, lunch/dinner might be 0.
            if (!activationDate) {
                // No history ever. 
                // Allow IF they have explicit status for today (even 0 implies tracking started for this day)
                if (!status) return;
            } else {
                // Check if current date is before activation
                // Compare YYYY-MM-DD strings or timestamps
                if (current.getTime() < activationDate.getTime()) {
                    // Check if strict: if they have explicit status for this pre-activation day, respect it.
                    if (!status) return;
                }
            }


            // 3. Status Timeline Check
            let computedStatus = 'Active';

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const activeLogs = user.statusLogs ? user.statusLogs.filter((log: any) => log.changedAt <= dayEnd) : [];
            if (activeLogs.length > 0) {
                computedStatus = activeLogs[activeLogs.length - 1].status;
            }

            if ((computedStatus === 'Inactive' || computedStatus === 'Deleted') && !status) {
                return;
            }

            dailyTotalUsers++;
            const displayName = formatUserName(user);

            // Fix: Respect user default for PAST days too, avoiding "ghost" meals.
            const isSahri = isSahriActive(current);
            const defaultLunch = user.defaultLunchStatus ? 1 : 0;
            const defaultDinner = user.defaultDinnerStatus ? 1 : 0;

            const defaultSahri = (isSahri && user.defaultSahriStatus) ? 1 : 0;

            const lVal = status ? status.lunch : defaultLunch;
            const dVal = status ? status.dinner : defaultDinner;
            const sVal = status ? status.sahri : defaultSahri;

            if (lVal > 0) {
                lunchCount += lVal;
                // Passed Logic
                let isPassed = false;
                if (dayState === 'PAST') isPassed = true;
                else if (dayState === 'TODAY' && currentMins >= lunchCutoffMins) isPassed = true;

                if (isPassed) passedLunchCount += lVal;

                const label = lVal > 1 ? `${displayName} (${lVal})` : displayName;
                lunchUsers.push(label);
            }
            if (dVal > 0) {
                dinnerCount += dVal;
                // Passed Logic
                let isPassed = false;
                if (dayState === 'PAST') isPassed = true;
                else if (dayState === 'TODAY' && currentMins >= dinnerCutoffMins) isPassed = true;

                if (isPassed) passedDinnerCount += dVal;

                const label = dVal > 1 ? `${displayName} (${dVal})` : displayName;
                dinnerUsers.push(label);
            }
            if (sVal > 0) {
                sahriCount += sVal;
                // Passed Logic
                // Sahri cutoff is usually very early morning.
                // We need sahriCutoffMins here. 
                // Hardcoding 03:00 AM (180 mins) for now as defined in other functions, or fetch from settings if we added it there.
                // Let's assume 3:00 AM.
                const sahriCutoffMins = 3 * 60;

                let isPassed = false;
                if (dayState === 'PAST') isPassed = true;
                else if (dayState === 'TODAY' && currentMins >= sahriCutoffMins) isPassed = true;

                if (isPassed) passedSahriCount += sVal;

                const label = sVal > 1 ? `${displayName} (${sVal})` : displayName;
                sahriUsers.push(label);
            }
        });

        history.push({
            date: new Date(current),
            lunchCount,
            dinnerCount,
            sahriCount, // New
            passedLunchCount,
            passedDinnerCount,
            passedSahriCount, // New
            totalUsers: dailyTotalUsers,
            lunchUsers,
            dinnerUsers,
            sahriUsers // New
        });

        current.setUTCDate(current.getUTCDate() + 1);
    }

    return history;
}
