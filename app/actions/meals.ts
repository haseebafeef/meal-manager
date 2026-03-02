'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { subDays, endOfMonth, addMonths } from 'date-fns';
import { prisma } from '@/app/lib/prisma';
import { getSystemSettings } from '@/app/lib/settings-actions';
import { SETTINGS_KEYS } from '@/app/lib/constants';
import { isSahriActive } from '@/app/lib/meals/utils';

import { syncUserStatus } from '@/app/services/users/status';
import { finalizeMonth } from '@/app/actions/expenses';

export async function updateMealCount(dateStr: string, type: 'lunch' | 'dinner' | 'sahri', newCount: number, targetUserId?: string) {
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userId = (session.user as any).id;
    if (!userId && session.user.email) {
        const user = await prisma.user.findFirst({ where: { email: session.user.email } });
        userId = user?.id;
    }

    if (targetUserId) {
        const currentUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!currentUser?.isAdmin) {
            return { error: "Unauthorized: Admin access required." };
        }
        userId = targetUserId;
    }

    if (!userId) return { error: "User not found" };

    const [y, m, d] = dateStr.split('-').map(Number);
    const targetDate = new Date(Date.UTC(y, m - 1, d)); 

    if (type === 'sahri' && !isSahriActive(targetDate)) {
        return { error: "Sahri is not active for this date." };
    }

    const now = new Date();
    const dhakaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Dhaka" });
    const dhakaDate = new Date(dhakaTimeStr);

    const dhakaTodayMidnight = new Date(Date.UTC(dhakaDate.getFullYear(), dhakaDate.getMonth(), dhakaDate.getDate()));

    const isByAdmin = !!targetUserId;

    const settingsRecord: Record<string, string> = await getSystemSettings();
    const settings = settingsRecord;
    const settingsMap = new Map<string, string>(Object.entries(settingsRecord));

    if (!isByAdmin) {
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

        const [lH, lM] = lunchCutoffStr.split(':').map(Number);
        const [dH, dM] = dinnerCutoffStr.split(':').map(Number);
        const [sH, sM] = sahriCutoffStr.split(':').map(Number);

        const lunchCutoffMins = lH * 60 + lM;
        const dinnerCutoffMins = dH * 60 + dM;
        const sahriCutoffMins = sH * 60 + sM;

        if (targetDate.getTime() < dhakaTodayMidnight.getTime()) {
            return { error: "Cannot change past meal status." };
        }

        const maxEditDate = endOfMonth(addMonths(dhakaDate, 2));
        if (targetDate > maxEditDate) {
            return { error: "Cannot manage meals beyond 2 months from now." };
        }

        if (targetDate.getTime() === dhakaTodayMidnight.getTime()) {
            const currentHour = dhakaDate.getHours();
            const currentMinute = dhakaDate.getMinutes();
            const minutesNow = currentHour * 60 + currentMinute;

            if (type === 'lunch') {
                if (minutesNow >= lunchCutoffMins) {
                    const limitTime12 = new Date(0, 0, 0, lH, lM).toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
                    return { error: `Lunch cutoff time (${limitTime12}) passed.` };
                }
            } else if (type === 'dinner') {
                if (minutesNow >= dinnerCutoffMins) {
                    const limitTime12 = new Date(0, 0, 0, dH, dM).toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
                    return { error: `Dinner cutoff time (${limitTime12}) passed.` };
                }
            } else if (type === 'sahri') {
                if (minutesNow >= sahriCutoffMins) {
                    const limitTime12 = new Date(0, 0, 0, sH, sM).toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
                    return { error: `Sahri cutoff time (${limitTime12}) passed.` };
                }
            }
        }
    } else {
        const tenDaysAgo = subDays(dhakaTodayMidnight, 10);
        if (targetDate < tenDaysAgo) {
            return { error: "Admin can only edit meals up to 10 days in the past." };
        }
    }

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
            const userPref = await prisma.user.findUnique({
                where: { id: userId },
                select: { defaultLunchStatus: true, defaultDinnerStatus: true, defaultSahriStatus: true }
            });

            const defaultLunch = userPref?.defaultLunchStatus ? 1 : 0;
            const defaultDinner = userPref?.defaultDinnerStatus ? 1 : 0;
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

        if (isByAdmin) {
            const editYear = dbDate.getUTCFullYear();
            const editMonthNum = dbDate.getUTCMonth() + 1; 
            const editMonthKey = `${editYear}-${String(editMonthNum).padStart(2, '0')}`;

            const existingSnapshot = await prisma.monthlySnapshot.findUnique({
                where: { userId_month: { userId, month: editMonthKey } }
            });

            if (existingSnapshot) {
                await finalizeMonth(userId, editYear, editMonthNum, existingSnapshot.mealRate);
            }
        }

        if (isByAdmin) {
            revalidatePath(`/dashboard/admin/meals/${userId}`);
            revalidatePath('/dashboard/admin/users');
        }

        revalidatePath('/dashboard/meals');
        revalidatePath('/dashboard/meals/history');

        await syncUserStatus(userId, settingsMap);

        return { success: "Meal status updated." };
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

        if (targetUserId) {
            userIdToLock = targetUserId;
            const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
            if (!currentUser?.isAdmin) {
                return { error: "Unauthorized: Admin access required." };
            }
        } else {
            const u = await prisma.user.findUnique({ where: { email: emailToUpdate } });
            userIdToLock = u?.id;
        }

        if (userIdToLock) {
            const now = new Date();
            const dhakaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Dhaka" });
            const dhakaDate = new Date(dhakaTimeStr);
            const dhakaTodayMidnight = new Date(Date.UTC(dhakaDate.getFullYear(), dhakaDate.getMonth(), dhakaDate.getDate()));

            const settingsRecord: Record<string, string> = await getSystemSettings();
            const settings = settingsRecord;

            let cutoffStr = '11:00';
            if (type === 'lunch') cutoffStr = settings?.[SETTINGS_KEYS.LUNCH_CUTOFF] || '11:00';
            else if (type === 'dinner') cutoffStr = settings?.[SETTINGS_KEYS.DINNER_CUTOFF] || '13:00';
            else if (type === 'sahri') cutoffStr = '03:00';

            const [cH, cM] = cutoffStr.split(':').map(Number);
            const cutoffMins = cH * 60 + cM;
            const currentMins = dhakaDate.getHours() * 60 + dhakaDate.getMinutes();

            const userForDefaults = await prisma.user.findUnique({
                where: { id: userIdToLock },
                select: { defaultLunchStatus: true, defaultDinnerStatus: true, defaultSahriStatus: true }
            });

            if (userForDefaults) {
                const oldDefaultLunch = userForDefaults.defaultLunchStatus ? 1 : 0;
                const oldDefaultDinner = userForDefaults.defaultDinnerStatus ? 1 : 0;
                const oldDefaultSahri = userForDefaults.defaultSahriStatus ? 1 : 0;

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

                    const dIter = new Date(startOfMonthDate);
                    while (dIter.getTime() <= yesterdayMidnight.getTime()) {
                        if (!existingDates.has(dIter.getTime())) {
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

            const tomorrowMidnight = new Date(dhakaTodayMidnight);
            tomorrowMidnight.setDate(tomorrowMidnight.getDate() + 1);

            const startDate = (currentMins >= cutoffMins) ? tomorrowMidnight : dhakaTodayMidnight;
            const endFillDate = new Date(dhakaDate.getFullYear(), dhakaDate.getMonth() + 2, 0); 

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

            const toCreate = [];
            const validSahriDates = [];
            const invalidSahriDates = [];

            const iterDate = new Date(startDate);
            while (iterDate <= endFillDate) {
                const dKey = new Date(Date.UTC(iterDate.getFullYear(), iterDate.getMonth(), iterDate.getDate()));
                const isSahri = isSahriActive(dKey);

                if (!existingDatesSet.has(dKey.getTime())) {
                    const otherDefaultLunch = userForDefaults?.defaultLunchStatus ? 1 : 0;
                    const otherDefaultDinner = userForDefaults?.defaultDinnerStatus ? 1 : 0;
                    const otherDefaultSahri = userForDefaults?.defaultSahriStatus ? 1 : 0;

                    const newVal = isEnabled ? 1 : 0;

                    const l = type === 'lunch' ? newVal : otherDefaultLunch;
                    const d = type === 'dinner' ? newVal : otherDefaultDinner;
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
                    if (isSahri) validSahriDates.push(dKey);
                    else invalidSahriDates.push(dKey);
                }

                iterDate.setDate(iterDate.getDate() + 1);
            }

            if (toCreate.length > 0) {
                await prisma.mealStatus.createMany({
                    data: toCreate
                });
            }

            const updateVal = isEnabled ? 1 : 0;

            if (type !== 'sahri') {
                if (existingRecords.length > 0) {
                    await prisma.mealStatus.updateMany({
                        where: {
                            userId: userIdToLock,
                            date: { in: existingRecords.map(r => r.date) }
                        },
                        data: { [type]: updateVal }
                    });
                }
            } else {
                if (validSahriDates.length > 0) {
                    await prisma.mealStatus.updateMany({
                        where: {
                            userId: userIdToLock,
                            date: { in: validSahriDates }
                        },
                        data: { sahri: updateVal }
                    });
                }
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

        let field = 'defaultLunchStatus';
        if (type === 'dinner') field = 'defaultDinnerStatus';
        else if (type === 'sahri') field = 'defaultSahriStatus';

        if (targetUserId) {
            await prisma.user.update({
                where: { id: targetUserId },
                data: { [field]: isEnabled }
            });
            revalidatePath(`/dashboard/admin/meals/${targetUserId}`);
            revalidatePath('/dashboard/meals');
            return { success: "Preferences updated." };
        } else {
            await prisma.user.update({
                where: { email: emailToUpdate },
                data: { [field]: isEnabled }
            });
            revalidatePath('/dashboard/meals');

            if (userIdToLock) {
                revalidatePath(`/dashboard/admin/meals/${userIdToLock}`);
            }
            return { success: "Preferences updated." };
        }
    } catch (error) {
        console.error(`Failed to update default ${type} status:`, error);
        return { error: "Failed to update setting" };
    }
}
