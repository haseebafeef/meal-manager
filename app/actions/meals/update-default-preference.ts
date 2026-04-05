'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/app/lib/prisma';
import { getSystemSettings } from '@/app/lib/settings-actions';
import { SETTINGS_KEYS } from '@/app/lib/constants';
import { isSahriActive } from '@/app/lib/meals/utils';

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
