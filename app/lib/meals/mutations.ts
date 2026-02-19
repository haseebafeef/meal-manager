'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { subDays, endOfMonth, addMonths } from 'date-fns';
import { prisma } from '@/app/lib/prisma';
import { getSystemSettings } from '@/app/lib/settings-actions';
import { SETTINGS_KEYS } from '@/app/lib/constants';
import { syncUserStatus } from '@/app/lib/expenses';
import { isSahriActive } from './utils';

export async function updateMealCount(dateStr: string, type: 'lunch' | 'dinner' | 'sahri', newCount: number, targetUserId?: string) {
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

    // Sahri Validity Check
    if (type === 'sahri' && !isSahriActive(targetDate)) {
        return { error: "Sahri is not active for this date." };
    }

    const now = new Date();
    // Determine today's date in the local timezone for strict rule enforcement.
    const dhakaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Dhaka" });
    const dhakaDate = new Date(dhakaTimeStr);

    // Represent the start of the current local day as a UTC midnight Date object for database matching.
    const dhakaTodayMidnight = new Date(Date.UTC(dhakaDate.getFullYear(), dhakaDate.getMonth(), dhakaDate.getDate()));

    const isByAdmin = !!targetUserId;

    // Fetch dynamic settings globally (needed for syncUserStatus at end)
    const settingsList = await prisma.systemSettings.findMany();
    const settingsMap = new Map(settingsList.map(s => [s.key, s.value]));
    // Backwards compatibility for local usage
    const settings = Object.fromEntries(settingsMap);

    if (!isByAdmin) {
        // Enforce Active Status
        const userStatus = await prisma.user.findUnique({
            where: { id: userId },
            select: { status: true }
        });

        if (userStatus?.status !== 'Active') {
            return { error: "Your account is inactive." };
        }

        const lunchCutoffStr = settings?.[SETTINGS_KEYS.LUNCH_CUTOFF] || '11:00';
        const dinnerCutoffStr = settings?.[SETTINGS_KEYS.DINNER_CUTOFF] || '13:00';
        const sahriCutoffStr = settings?.[SETTINGS_KEYS.SAHRI_CUTOFF] || '18:00';

        // Parse HH:MM
        const [lH, lM] = lunchCutoffStr.split(':').map(Number);
        const [dH, dM] = dinnerCutoffStr.split(':').map(Number);
        const [sH, sM] = sahriCutoffStr.split(':').map(Number);

        // Convert to minutes for easy comparison
        const lunchCutoffMins = lH * 60 + lM;
        const dinnerCutoffMins = dH * 60 + dM;
        const sahriCutoffMins = sH * 60 + sM;

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
            } else if (type === 'dinner') {
                // Dynamic Cutoff Check
                if (minutesNow >= dinnerCutoffMins) {
                    const limitTime12 = new Date(0, 0, 0, dH, dM).toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
                    return { error: `Dinner cutoff time (${limitTime12}) passed.` };
                }
            } else if (type === 'sahri') {
                // Dynamic Cutoff Check
                if (minutesNow >= sahriCutoffMins) {
                    const limitTime12 = new Date(0, 0, 0, sH, sM).toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
                    return { error: `Sahri cutoff time (${limitTime12}) passed.` };
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

                select: { defaultLunchStatus: true, defaultDinnerStatus: true, defaultSahriStatus: true }
            });

            // Standard defaults for the OTHER types
            // If we are setting one Type, we must preserve Defaults for others if creating new record.
            const defaultLunch = userPref?.defaultLunchStatus ? 1 : 0;
            const defaultDinner = userPref?.defaultDinnerStatus ? 1 : 0;
            // Sahri default only applies if active date? 
            // Yes, but here we are creating a specific record. 
            // If the user hasn't set Sahri, it should be 0 or default.
            // Check if Sahri is active for this target date before applying default?
            // Actually, if we are creating a record, we should respect the isActive check for default application too.
            const isSahri = isSahriActive(dbDate);

            const defaultSahri = (isSahri && userPref?.defaultSahriStatus) ? 1 : 0;

            await prisma.mealStatus.create({
                data: {
                    userId: userId,
                    date: dbDate,
                    lunch: type === 'lunch' ? newCount : defaultLunch,
                    dinner: type === 'dinner' ? newCount : defaultDinner,

                    sahri: type === 'sahri' ? newCount : defaultSahri,
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
        // Optimization: Pass already fetched settings map
        await syncUserStatus(userId, settingsMap);

        return { success: true };
    } catch (error) {
        console.error(error);
        return { error: "Database error" };
    }

}

export async function updateDefaultMealPreference(type: 'lunch' | 'dinner' | 'sahri', isEnabled: boolean, targetUserId?: string) {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    try {
        const emailToUpdate = session.user.email;
        let userIdToLock: string | undefined;

        // 1. Resolve User ID early
        if (targetUserId) {
            userIdToLock = targetUserId;
        } else {
            const u = await prisma.user.findUnique({ where: { email: emailToUpdate } });
            userIdToLock = u?.id;
        }

        if (userIdToLock) {
            // --- Shared Date & Settings Logic ---
            // Define all time variables here to avoid scope issues
            const now = new Date();
            const dhakaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Dhaka" });
            const dhakaDate = new Date(dhakaTimeStr);
            const dhakaTodayMidnight = new Date(Date.UTC(dhakaDate.getFullYear(), dhakaDate.getMonth(), dhakaDate.getDate()));

            const settings = await getSystemSettings();

            let cutoffStr = '11:00';
            if (type === 'lunch') cutoffStr = settings?.[SETTINGS_KEYS.LUNCH_CUTOFF] || '11:00';
            else if (type === 'dinner') cutoffStr = settings?.[SETTINGS_KEYS.DINNER_CUTOFF] || '13:00';
            else if (type === 'sahri') cutoffStr = '03:00';

            const [cH, cM] = cutoffStr.split(':').map(Number);
            const cutoffMins = cH * 60 + cM;
            const currentMins = dhakaDate.getHours() * 60 + dhakaDate.getMinutes();

            // 2. Lock History: Backfill "Past Days of Current Month" with *OLD* Defaults
            // This prevents "Time Travel" where changing default today retcons the past.
            const userForDefaults = await prisma.user.findUnique({
                where: { id: userIdToLock },

                select: { defaultLunchStatus: true, defaultDinnerStatus: true, defaultSahriStatus: true }
            });

            if (userForDefaults) {
                const oldDefaultLunch = userForDefaults.defaultLunchStatus ? 1 : 0;
                const oldDefaultDinner = userForDefaults.defaultDinnerStatus ? 1 : 0;

                const oldDefaultSahri = userForDefaults.defaultSahriStatus ? 1 : 0;

                // Range: Start of Month -> Yesterday (inclusive)
                const startOfMonthDate = new Date(Date.UTC(dhakaDate.getFullYear(), dhakaDate.getMonth(), 1));
                const yesterdayMidnight = new Date(dhakaTodayMidnight);
                yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1);

                if (yesterdayMidnight >= startOfMonthDate) {
                    const existingRecords = await prisma.mealStatus.findMany({
                        where: {
                            userId: userIdToLock,
                            date: {
                                gte: startOfMonthDate,
                                lte: yesterdayMidnight
                            }
                        },
                        select: { date: true }
                    });

                    const existingDates = new Set(existingRecords.map((r: { date: Date }) => r.date.getTime()));
                    const toCreate = [];

                    // Iterate Start -> Yesterday
                    const dIter = new Date(startOfMonthDate);
                    while (dIter.getTime() <= yesterdayMidnight.getTime()) {
                        if (!existingDates.has(dIter.getTime())) {
                            // Check Sahri Validity for backfill
                            const isSahri = isSahriActive(dIter);

                            toCreate.push({
                                userId: userIdToLock,
                                date: new Date(dIter),
                                lunch: oldDefaultLunch,
                                dinner: oldDefaultDinner,
                                sahri: isSahri ? oldDefaultSahri : 0
                            });
                        }
                        dIter.setDate(dIter.getDate() + 1);
                    }

                    if (toCreate.length > 0) {
                        await prisma.mealStatus.createMany({
                            data: toCreate
                        });
                    }
                }

                // 3. Lock "Today" if Cutoff Passed
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
                        // If cutoff passed, we lock TODAY with the OLD value.
                        // The user's NEW setting will apply from Tomorrow.

                        const valLunch = userForDefaults.defaultLunchStatus ? 1 : 0;
                        const valDinner = userForDefaults.defaultDinnerStatus ? 1 : 0;

                        const valSahri = userForDefaults.defaultSahriStatus ? 1 : 0;

                        const isSahri = isSahriActive(dhakaTodayMidnight);

                        await prisma.mealStatus.create({
                            data: {
                                userId: userIdToLock,
                                date: dhakaTodayMidnight,
                                lunch: valLunch,
                                dinner: valDinner,

                                sahri: isSahri ? valSahri : 0
                            }
                        });
                    }
                }
            }

            // 4. Force Future Overwrite (Explicitly Create Records for Remainder of Current Month)
            // Start Date: "Tomorrow" if cutoff passed, otherwise "Today".
            const tomorrowMidnight = new Date(dhakaTodayMidnight);
            tomorrowMidnight.setDate(tomorrowMidnight.getDate() + 1);

            const startDate = (currentMins >= cutoffMins) ? tomorrowMidnight : dhakaTodayMidnight;

            // Define End Date: Remainder of CURRENT MONTH + NEXT MONTH.
            const endFillDate = new Date(dhakaDate.getFullYear(), dhakaDate.getMonth() + 2, 0); // End of Next Month

            // OPTIMIZED BATCH LOGIC
            // 1. Fetch Existing Records in Range
            const existingRecords = await prisma.mealStatus.findMany({
                where: {
                    userId: userIdToLock,
                    date: {
                        gte: startDate,
                        lte: endFillDate
                    }
                },
                select: { date: true }
            });

            const existingDatesSet = new Set(existingRecords.map(r => r.date.getTime()));

            // 2. Prepare Lists for Batch Operations
            const toCreate = [];
            const validSahriDates = [];
            const invalidSahriDates = [];

            // Iterate through range
            const iterDate = new Date(startDate);
            while (iterDate <= endFillDate) {
                const dKey = new Date(Date.UTC(iterDate.getFullYear(), iterDate.getMonth(), iterDate.getDate()));

                // Identify if Sahri is valid for this date
                const isSahri = isSahriActive(dKey);

                if (!existingDatesSet.has(dKey.getTime())) {
                    // Prepare for Create
                    const otherDefaultLunch = userForDefaults?.defaultLunchStatus ? 1 : 0;
                    const otherDefaultDinner = userForDefaults?.defaultDinnerStatus ? 1 : 0;

                    const otherDefaultSahri = userForDefaults?.defaultSahriStatus ? 1 : 0;

                    const newVal = isEnabled ? 1 : 0;

                    const l = type === 'lunch' ? newVal : otherDefaultLunch;
                    const d = type === 'dinner' ? newVal : otherDefaultDinner;
                    // Sahri Logic: If updating Sahri -> Check Validity. If valid, set newVal. If invalid, 0.
                    // If updating others -> Check Validity. If valid, use old default. If invalid, 0.
                    const s = type === 'sahri'
                        ? (isSahri && newVal ? 1 : 0)
                        : (isSahri ? otherDefaultSahri : 0);

                    toCreate.push({
                        userId: userIdToLock,
                        date: dKey,
                        lunch: l,
                        dinner: d,
                        sahri: s
                    });
                } else {
                    // Existing Record Logic
                    if (isSahri) validSahriDates.push(dKey);
                    else invalidSahriDates.push(dKey);
                }

                iterDate.setDate(iterDate.getDate() + 1);
            }

            // 3. Execute Batch Operations
            if (toCreate.length > 0) {
                await prisma.mealStatus.createMany({
                    data: toCreate
                });
            }

            // 4. Update Existing Records
            const updateVal = isEnabled ? 1 : 0;

            if (type !== 'sahri') {
                // For Lunch/Dinner: Simple Update Many if dates exist
                if (existingRecords.length > 0) {
                    await prisma.mealStatus.updateMany({
                        where: {
                            userId: userIdToLock,
                            date: {
                                in: existingRecords.map(r => r.date)
                            }
                        },
                        data: {
                            [type]: updateVal
                        }
                    });
                }
            } else {
                // For Sahri: Split Logic based on validity
                if (validSahriDates.length > 0) {
                    await prisma.mealStatus.updateMany({
                        where: {
                            userId: userIdToLock,
                            date: { in: validSahriDates }
                        },

                        data: { sahri: updateVal }
                    });
                }
                // Invalid dates always force 0 for Sahri
                if (invalidSahriDates.length > 0) {
                    await prisma.mealStatus.updateMany({
                        where: {
                            userId: userIdToLock,
                            date: { in: invalidSahriDates }
                        },

                        data: { sahri: 0 }
                    });
                }
            }
        }

        // 5. Update the Setting
        if (targetUserId) {
            const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
            if (!currentUser?.isAdmin) {
                return { error: "Unauthorized: Admin access required" };
            }

            let field = 'defaultLunchStatus';
            if (type === 'dinner') field = 'defaultDinnerStatus';
            else if (type === 'sahri') field = 'defaultSahriStatus';

            await prisma.user.update({
                where: { id: targetUserId },
                data: { [field]: isEnabled }
            });
            revalidatePath(`/dashboard/admin/meals/${targetUserId}`);
            revalidatePath('/dashboard/meals');
            return { success: true };
        } else {
            let field = 'defaultLunchStatus';
            if (type === 'dinner') field = 'defaultDinnerStatus';
            else if (type === 'sahri') field = 'defaultSahriStatus';

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
