'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/app/lib/prisma';
import { isSahriActive } from '@/app/lib/meals/utils';

export async function finalizeMonth(userId: string, year: number, monthNum: number, rate: number): Promise<{ success?: string; error?: string; count?: number; cost?: number }> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser?.isAdmin) return { error: "Unauthorized: Admin access required." };

    const startUTC = new Date(Date.UTC(year, monthNum - 1, 1));
    const endUTC = new Date(Date.UTC(year, monthNum, 0));

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { defaultLunchStatus: true, defaultDinnerStatus: true, defaultSahriStatus: true }
    });
    if (!user) return { error: 'User not found' };

    const [meals, statusLogs, initialStatusLog] = await Promise.all([
        prisma.mealStatus.findMany({
            where: {
                userId: userId,
                date: { gte: startUTC, lte: endUTC }
            }
        }),
        prisma.userStatusLog.findMany({
            where: {
                userId: userId,
                changedAt: { gte: startUTC, lte: new Date(endUTC.getTime() + 24 * 60 * 60 * 1000) }
            },
            orderBy: { changedAt: 'asc' }
        }),
        prisma.userStatusLog.findFirst({
            where: {
                userId: userId,
                changedAt: { lt: startUTC }
            },
            orderBy: { changedAt: 'desc' }
        })
    ]);

    const mealMap = new Map<string, typeof meals[0]>();
    meals.forEach(m => mealMap.set(m.date.toISOString().split('T')[0], m));

    let totalMeals = 0;
    const daysInMonth = endUTC.getUTCDate();

    let currentStatus = initialStatusLog?.status || 'Active';
    let logIdx = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateUTC = new Date(Date.UTC(year, monthNum - 1, day));
        const dateKey = dateUTC.toISOString().split('T')[0];

        const dayEnd = new Date(dateUTC.getTime() + 24 * 60 * 60 * 1000 - 1);
        while (logIdx < statusLogs.length && statusLogs[logIdx].changedAt <= dayEnd) {
            currentStatus = statusLogs[logIdx].status;
            logIdx++;
        }

        const record = mealMap.get(dateKey);

        if (record) {
            totalMeals += Number(record.lunch) + Number(record.dinner) + Number(record.sahri);
        } else if (currentStatus === 'Active') {
            const defL = user.defaultLunchStatus ? 1 : 0;
            const defD = user.defaultDinnerStatus ? 1 : 0;
            const defS = (isSahriActive(dateUTC) && user.defaultSahriStatus) ? 1 : 0;
            totalMeals += defL + defD + defS;
        }
    }

    const totalCost = totalMeals * rate;
    const monthKey = `${year}-${String(monthNum).padStart(2, '0')}`;

    try {
        await prisma.monthlySnapshot.upsert({
            where: { userId_month: { userId, month: monthKey } },
            update: { mealRate: rate, totalMeals, totalCost },
            create: {
                userId,
                month: monthKey,
                year,
                monthNum,
                mealRate: rate,
                totalMeals,
                totalCost
            }
        });
    } catch (e) {
        console.error("Database Error:", e);
        return { error: 'Database Error: Failed to finalize month.' };
    }


    revalidatePath('/dashboard');
    return { success: `Month ${monthKey} finalized for user.`, count: totalMeals, cost: totalCost };
}
