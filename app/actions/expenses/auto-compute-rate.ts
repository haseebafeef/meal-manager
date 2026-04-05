'use server';

import { auth } from '@/auth';
import { revalidatePath, revalidateTag } from 'next/cache';
import { prisma } from '@/app/lib/prisma';
import { SETTINGS_KEYS } from '@/app/lib/constants';

export async function autoComputePrevMonthRate(year: number, monthNum: number): Promise<{ success?: string; error?: string; rate?: number; totalExpenses?: number; totalMeals?: number; saved?: boolean }> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser?.isAdmin) return { error: "Unauthorized: Admin access required." };

    const startUTC = new Date(Date.UTC(year, monthNum - 1, 1));
    const endUTC = new Date(Date.UTC(year, monthNum, 0));

    const expStartUTC = new Date(startUTC.getTime() - 6 * 60 * 60 * 1000);
    const expEndUTC = new Date(endUTC.getTime() - 6 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1);

    const expenseAgg = await prisma.expense.aggregate({
        where: { date: { gte: expStartUTC, lte: expEndUTC } },
        _sum: { amount: true }
    });
    const totalExpenses = expenseAgg._sum.amount || 0;

    // Calculate exact meals for all active users factoring in default statuses
    const users = await prisma.user.findMany({ where: { status: { not: 'Deleted' } } });
    const allMeals = await prisma.mealStatus.findMany({
        where: { date: { gte: startUTC, lte: endUTC } }
    });
    const allStatusLogs = await prisma.userStatusLog.findMany({
        where: { changedAt: { gte: expStartUTC, lte: expEndUTC } },
        orderBy: { changedAt: 'asc' }
    });
    const initialStatusLogs = await prisma.userStatusLog.findMany({
        where: { changedAt: { lt: expStartUTC } },
        orderBy: { changedAt: 'desc' }
    });

    let globalTotalMeals = 0;
    const daysInMonth = endUTC.getUTCDate();

    for (const user of users) {
        const userMeals = allMeals.filter(m => m.userId === user.id);
        const mealMap = new Map();
        userMeals.forEach(m => mealMap.set(m.date.toISOString().split('T')[0], m));

        let userLogIdx = 0;
        const userLogs = allStatusLogs.filter(l => l.userId === user.id);
        const initLog = initialStatusLogs.find(l => l.userId === user.id);
        let currentStatus = initLog?.status || 'Active';

        for (let day = 1; day <= daysInMonth; day++) {
            const dateUTC = new Date(Date.UTC(year, monthNum - 1, day));
            const dateKey = dateUTC.toISOString().split('T')[0];
            const dayEnd = new Date(dateUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

            while (userLogIdx < userLogs.length && userLogs[userLogIdx].changedAt <= dayEnd) {
                currentStatus = userLogs[userLogIdx].status;
                userLogIdx++;
            }

            const record = mealMap.get(dateKey);
            if (record) {
                globalTotalMeals += Number(record.lunch) + Number(record.dinner) + Number(record.sahri);
            } else if (currentStatus === 'Active') {
                const wasCreated = !user.createdAt || user.createdAt <= dayEnd;
                if (wasCreated) {
                    const defL = user.defaultLunchStatus ? 1 : 0;
                    const defD = user.defaultDinnerStatus ? 1 : 0;
                    globalTotalMeals += defL + defD;
                }
            }
        }
    }

    const totalMeals = globalTotalMeals;
    let rate = 0;
    if (totalMeals > 0) {
        rate = Math.ceil((totalExpenses / totalMeals) * 100) / 100;
    }

    await prisma.$transaction([
        prisma.systemSettings.upsert({
            where: { key: SETTINGS_KEYS.PREV_MEAL_RATE },
            update: { value: String(rate) },
            create: { key: SETTINGS_KEYS.PREV_MEAL_RATE, value: String(rate) }
        }),
        prisma.systemSettings.upsert({
            where: { key: SETTINGS_KEYS.PREV_MEAL_RATE_SOURCE },
            update: { value: 'auto' },
            create: { key: SETTINGS_KEYS.PREV_MEAL_RATE_SOURCE, value: 'auto' }
        })
    ]);

    revalidateTag('settings', 'default');
    revalidatePath('/dashboard/admin/settings');

    return { success: `Previous month rate computed and saved as ${rate}.`, rate, totalExpenses, totalMeals, saved: true };
}
