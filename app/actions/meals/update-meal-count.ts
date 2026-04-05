'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { subDays, endOfMonth, addMonths } from 'date-fns';
import { prisma } from '@/app/lib/prisma';
import { getSystemSettings } from '@/app/lib/settings-actions';
import { SETTINGS_KEYS } from '@/app/lib/constants';
import { isSahriActive } from '@/app/lib/meals/utils';

import { syncUserStatus } from '@/app/services/users/status';
import { finalizeMonth } from '@/app/actions/expenses/finalize-month';

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
