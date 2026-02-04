'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { startOfMonth, endOfMonth, addMonths, endOfDay, subDays } from 'date-fns';
import { getNowDhaka, formatUserName } from '@/app/lib/utils';
import { getSystemSettings } from '@/app/lib/settings-actions';
import { SETTINGS_KEYS } from '@/app/lib/constants';
import { syncUserStatus } from '@/app/lib/expense-actions';

import { prisma } from '@/app/lib/prisma';

// Initial fixed rate (fallback)


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
    const start = startOfMonth(now);
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

export async function updateMealCount(dateStr: string, type: 'lunch' | 'dinner', newCount: number, targetUserId?: string) {
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userId = (session.user as any).id;
    if (!userId && session.user.email) {
        const user = await prisma.user.findFirst({ where: { email: session.user.email } });
        userId = user?.id;
    }

    // Admin Override
    if (targetUserId) {
        const currentUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!currentUser?.isAdmin) {
            return { error: "Unauthorized: Admin access required." };
        }
        userId = targetUserId;
    }

    if (!userId) return { error: "User not found" };

    // Date Logic - Strict UTC Midnight
    const [y, m, d] = dateStr.split('-').map(Number);
    const targetDate = new Date(Date.UTC(y, m - 1, d)); // UTC Midnight

    const now = new Date();
    // Determine today's date in the local timezone for strict rule enforcement.
    const dhakaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Dhaka" });
    const dhakaDate = new Date(dhakaTimeStr);

    // Represent the start of the current local day as a UTC midnight Date object for database matching.
    const dhakaTodayMidnight = new Date(Date.UTC(dhakaDate.getFullYear(), dhakaDate.getMonth(), dhakaDate.getDate()));

    const isByAdmin = !!targetUserId;

    if (!isByAdmin) {
        // Enforce Active Status
        const userStatus = await prisma.user.findUnique({
            where: { id: userId },
            select: { status: true }
        });

        if (userStatus?.status !== 'Active') {
            return { error: "Your account is inactive." };
        }

        // Fetch dynamic settings 
        const settings = await getSystemSettings();
        const lunchCutoffStr = settings?.[SETTINGS_KEYS.LUNCH_CUTOFF] || '11:00';
        const dinnerCutoffStr = settings?.[SETTINGS_KEYS.DINNER_CUTOFF] || '13:00';

        // Parse HH:MM
        const [lH, lM] = lunchCutoffStr.split(':').map(Number);
        const [dH, dM] = dinnerCutoffStr.split(':').map(Number);

        // Convert to minutes for easy comparison
        const lunchCutoffMins = lH * 60 + lM;
        const dinnerCutoffMins = dH * 60 + dM;

        // 1. Past Check
        // If targetDate check is smaller than today's midnight -> It's yesterday or before
        if (targetDate.getTime() < dhakaTodayMidnight.getTime()) {
            return { error: "Cannot change past meal status." };
        }

        // 2. Future Limit Check (Current Month + 2 Months)
        // We use dhakaDate to determine "Current Month"
        const maxEditDate = endOfMonth(addMonths(dhakaDate, 2));
        // We compare targetDate (UTC Midnight) with maxEditDate. 
        // Since maxEditDate includes time, and targetDate is 00:00,
        // if targetDate is AFTER maxEditDate, it's definitely out of bounds.
        if (targetDate > maxEditDate) {
            return { error: "Cannot manage meals beyond 2 months from now." };
        }

        // 3. Cutoff Check (Only if target is Today)
        if (targetDate.getTime() === dhakaTodayMidnight.getTime()) {
            const currentHour = dhakaDate.getHours();
            const currentMinute = dhakaDate.getMinutes();
            const minutesNow = currentHour * 60 + currentMinute;

            if (type === 'lunch') {
                // Dynamic Cutoff Check
                if (minutesNow >= lunchCutoffMins) {
                    const limitTime12 = new Date(0, 0, 0, lH, lM).toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
                    return { error: `Lunch cutoff time (${limitTime12}) passed.` };
                }
            } else {
                // Dynamic Cutoff Check
                if (minutesNow >= dinnerCutoffMins) {
                    const limitTime12 = new Date(0, 0, 0, dH, dM).toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
                    return { error: `Dinner cutoff time (${limitTime12}) passed.` };
                }
            }
        }
    } else {
        // Admin Constraint: 10 Days Past Limit
        const tenDaysAgo = subDays(dhakaTodayMidnight, 10);
        if (targetDate < tenDaysAgo) {
            return { error: "Admin can only edit meals up to 10 days in the past." };
        }
    }

    // Normalize date to midnight for DB storage
    // We use the UTC Midnight date (targetDate) as the key.
    const dbDate = targetDate;

    try {
        const existing = await prisma.mealStatus.findUnique({
            where: {
                date_userId: {
                    date: dbDate,
                    userId: userId
                }
            }
        });

        if (existing) {
            await prisma.mealStatus.update({
                where: { id: existing.id },
                data: { [type]: newCount }
            });
        } else {
            // Fetch user preference for defaults
            const userPref = await prisma.user.findUnique({
                where: { id: userId },
                select: { defaultLunchStatus: true, defaultDinnerStatus: true }
            });

            // Standard defaults for the OTHER type
            const defaultLunch = userPref?.defaultLunchStatus ? 1 : 0;
            const defaultDinner = userPref?.defaultDinnerStatus ? 1 : 0;

            await prisma.mealStatus.create({
                data: {
                    userId: userId,
                    date: dbDate,
                    lunch: type === 'lunch' ? newCount : defaultLunch,
                    dinner: type === 'dinner' ? newCount : defaultDinner,
                }
            });
        }

        // Revalidate ALL paths to ensure synchronization
        // 1. Revalidate the user's own dashboard
        revalidatePath('/dashboard/meals');
        revalidatePath('/dashboard/meals/history');

        // 2. Revalidate the specific admin view for this user
        revalidatePath(`/dashboard/admin/meals/${userId}`);

        // 3. Revalidate the main admin meals list (if applicable)
        revalidatePath('/dashboard/admin/users');

        // Check Account Status (Auto-off)
        await syncUserStatus(userId);

        return { success: true };
    } catch (error) {
        console.error(error);
        return { error: "Database error" };
    }

}

export async function updateDefaultMealPreference(type: 'lunch' | 'dinner', isEnabled: boolean, targetUserId?: string) {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    try {
        let emailToUpdate = session.user.email;
        let userIdToLock: string | undefined;

        // 1. Resolve User ID early for locking logic
        if (targetUserId) {
            userIdToLock = targetUserId;
        } else {
            const u = await prisma.user.findUnique({ where: { email: emailToUpdate } });
            userIdToLock = u?.id;
        }

        if (userIdToLock) {
            // 2. Lock "Today" if Cutoff Passed
            // Prevents retroactive changes to today's meal status when modifying defaults after the daily cutoff.
            const now = new Date();
            const dhakaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Dhaka" });
            const dhakaDate = new Date(dhakaTimeStr);
            const dhakaTodayMidnight = new Date(Date.UTC(dhakaDate.getFullYear(), dhakaDate.getMonth(), dhakaDate.getDate()));

            const settings = await getSystemSettings();
            const cutoffStr = type === 'lunch'
                ? (settings?.[SETTINGS_KEYS.LUNCH_CUTOFF] || '11:00')
                : (settings?.[SETTINGS_KEYS.DINNER_CUTOFF] || '13:00');

            const [cH, cM] = cutoffStr.split(':').map(Number);
            const cutoffMins = cH * 60 + cM;
            const currentMins = dhakaDate.getHours() * 60 + dhakaDate.getMinutes();

            if (currentMins >= cutoffMins) {
                const existingToday = await prisma.mealStatus.findUnique({
                    where: {
                        date_userId: {
                            date: dhakaTodayMidnight,
                            userId: userIdToLock
                        }
                    }
                });

                if (!existingToday) {
                    // Implicit old default usage detected.
                    // Create an explicit record to preserve the current state before the default changes.
                    const userForDefaults = await prisma.user.findUnique({
                        where: { id: userIdToLock },
                        select: { defaultLunchStatus: true, defaultDinnerStatus: true }
                    });

                    if (userForDefaults) {
                        const currentVal = type === 'lunch'
                            ? (userForDefaults.defaultLunchStatus ? 1 : 0)
                            : (userForDefaults.defaultDinnerStatus ? 1 : 0);

                        const otherValLunch = userForDefaults.defaultLunchStatus ? 1 : 0;
                        const otherValDinner = userForDefaults.defaultDinnerStatus ? 1 : 0;

                        await prisma.mealStatus.create({
                            data: {
                                userId: userIdToLock,
                                date: dhakaTodayMidnight,
                                lunch: type === 'lunch' ? currentVal : otherValLunch,
                                dinner: type === 'dinner' ? currentVal : otherValDinner
                            }
                        });
                    }
                }
            }

            // 3. Force Future Overwrite
            // Apply new default to all future days to ensure synchronization.
            // Start Date: "Tomorrow" if cutoff passed, otherwise "Today".
            const tomorrowMidnight = new Date(dhakaTodayMidnight);
            tomorrowMidnight.setDate(tomorrowMidnight.getDate() + 1);

            const startDate = (currentMins >= cutoffMins) ? tomorrowMidnight : dhakaTodayMidnight;

            await prisma.mealStatus.updateMany({
                where: {
                    userId: userIdToLock,
                    date: { gte: startDate }
                },
                data: {
                    [type]: isEnabled ? 1 : 0
                }
            });
        }

        // 3. Update the Setting
        if (targetUserId) {
            const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
            if (!currentUser?.isAdmin) {
                return { error: "Unauthorized: Admin access required" };
            }

            // Allow update even if targetUser validation strictly failed above? 
            // Better to re-check or assuming ID is valid if passed.
            // Using ID update is safest.
            const field = type === 'lunch' ? 'defaultLunchStatus' : 'defaultDinnerStatus';
            await prisma.user.update({
                where: { id: targetUserId },
                data: { [field]: isEnabled }
            });
            revalidatePath(`/dashboard/admin/meals/${targetUserId}`);
            revalidatePath('/dashboard/meals');
            return { success: true };
        } else {
            const field = type === 'lunch' ? 'defaultLunchStatus' : 'defaultDinnerStatus';
            await prisma.user.update({
                where: { email: emailToUpdate },
                data: { [field]: isEnabled }
            });
            revalidatePath('/dashboard/meals');
            if (userIdToLock) {
                revalidatePath(`/dashboard/admin/meals/${userIdToLock}`);
            }
            return { success: true };
        }
    } catch (error) {
        console.error(`Failed to update default ${type} status:`, error);
        return { error: "Failed to update setting" };
    }
}


export async function getDailyMealStats() {
    const now = new Date();
    // Local Time logic for "Today"
    const dhakaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Dhaka" });
    const dhakaDate = new Date(dhakaTimeStr);

    // Local Today Midnight (in UTC representation for DB)
    const targetDate = new Date(Date.UTC(dhakaDate.getFullYear(), dhakaDate.getMonth(), dhakaDate.getDate()));

    const allUsers = await prisma.user.findMany({
        select: {
            id: true,
            name: true,
            nickname: true,
            status: true,
            defaultLunchStatus: true,
            defaultDinnerStatus: true
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

        const lunchCount = status ? status.lunch : defaultLunch;
        const dinnerCount = status ? status.dinner : defaultDinner;

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
    });

    return stats;
}

export async function getMonthlyMealHistory(year: number, month: number) {
    // Use strict UTC dates to avoid timezone shifts
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 0)); // Last day of the month in UTC

    // Get all users (Active & Inactive) to calculate history correctly based on time
    const allUsers = await prisma.user.findMany({
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
            defaultDinnerStatus: true
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
        const todayUTC = new Date(Date.UTC(nowDhaka.getFullYear(), nowDhaka.getMonth(), nowDhaka.getDate()));

        if (d.getTime() < todayUTC.getTime()) return 'PAST';
        if (d.getTime() > todayUTC.getTime()) return 'FUTURE';
        return 'TODAY';
    };

    const currentMins = nowDhaka.getHours() * 60 + nowDhaka.getMinutes();

    while (current <= end) {
        const dateKey = current.toISOString().split('T')[0];
        let lunchCount = 0;
        let dinnerCount = 0;
        let passedLunchCount = 0;
        let passedDinnerCount = 0;

        let dailyTotalUsers = 0;
        const lunchUsers: string[] = [];
        const dinnerUsers: string[] = [];

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

            // 2. Status Timeline Check
            let computedStatus = 'Active';
            const activeLogs = user.statusLogs.filter(log => log.changedAt <= dayEnd);
            if (activeLogs.length > 0) {
                computedStatus = activeLogs[activeLogs.length - 1].status;
            }

            if ((computedStatus === 'Inactive' || computedStatus === 'Deleted') && !status) {
                return;
            }

            dailyTotalUsers++;
            const displayName = formatUserName(user);

            // Default Logic: 
            // - PAST: Default to 1 (Legacy behavior assumption)
            // - TODAY/FUTURE: Use User Preference
            let defaultLunch = 1;
            let defaultDinner = 1;

            if (dayState !== 'PAST') {
                defaultLunch = user.defaultLunchStatus ? 1 : 0;
                defaultDinner = user.defaultDinnerStatus ? 1 : 0;
            }

            const lVal = status ? status.lunch : defaultLunch;
            const dVal = status ? status.dinner : defaultDinner;

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
        });

        history.push({
            date: new Date(current),
            lunchCount,
            dinnerCount,
            passedLunchCount,
            passedDinnerCount,
            totalUsers: dailyTotalUsers,
            lunchUsers,
            dinnerUsers
        });

        current.setUTCDate(current.getUTCDate() + 1);
    }

    return history;
}
