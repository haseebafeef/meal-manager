'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/app/lib/prisma';

export async function finalizeSystemMonth(year: number, monthNum: number, rate: number): Promise<{ success?: string; error?: string; usersProcessed?: number }> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser?.isAdmin) return { error: "Unauthorized: Admin access required." };

    const monthKey = `${year}-${String(monthNum).padStart(2, '0')}`;

    // Determine the exact key for the previous month
    let prevYear = year;
    let prevMonthNum = monthNum - 1;
    if (prevMonthNum === 0) {
        prevMonthNum = 12;
        prevYear -= 1;
    }
    const prevMonthKey = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}`;

    console.log(`Finalizing System Month: ${monthKey} using Rate ${rate}`);

    const users = await prisma.user.findMany({
        where: { status: { not: 'Deleted' } }
    });

    const mealStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const mealEnd = new Date(Date.UTC(year, monthNum, 0));

    // Dhak offsets for transactions
    const txStart = new Date(mealStart.getTime() - 6 * 60 * 60 * 1000);
    const txEnd = new Date(mealEnd.getTime() - 6 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1);

    // Pre-fetch all previous snapshots
    const prevSnapshots = await prisma.monthlySnapshot.findMany({
        where: { month: prevMonthKey }
    });
    const prevSnapshotMap = new Map(prevSnapshots.map(s => [s.userId, s]));

    // Pre-fetch transactions in bulk for this month
    const allTxs = await prisma.transaction.findMany({
        where: { createdAt: { gte: txStart, lte: txEnd }, status: 'APPROVED' },
        select: { requesterId: true, amount: true }
    });

    // Group TX by user
    const txMap = new Map<string, number>();
    for (const tx of allTxs) {
        if (!tx.requesterId) continue;
        txMap.set(tx.requesterId, (txMap.get(tx.requesterId) || 0) + tx.amount);
    }

    // Process each user sequentially
    for (const user of users) {
        // 1. Get Prev Balance
        const prevSnap = prevSnapshotMap.get(user.id);
        const prevBalance = prevSnap ? prevSnap.closingBalance : 0; // Baseline to 0 if totally missing

        // 2. Total Credit This Month
        const totalCredit = txMap.get(user.id) || 0;

        // 3. Exact Meals Calculation
        const meals = await prisma.mealStatus.findMany({
            where: { userId: user.id, date: { gte: mealStart, lte: mealEnd } }
        });

        const statusLogs = await prisma.userStatusLog.findMany({
            where: { userId: user.id, changedAt: { gte: txStart, lte: txEnd } },
            orderBy: { changedAt: 'asc' }
        });
        const initialStatusLog = await prisma.userStatusLog.findFirst({
            where: { userId: user.id, changedAt: { lt: txStart } },
            orderBy: { changedAt: 'desc' }
        });

        const mealMap = new Map();
        meals.forEach(m => mealMap.set(m.date.toISOString().split('T')[0], m));

        let totalMeals = 0;
        let currentStatus = initialStatusLog?.status || 'Active';
        let logIdx = 0;

        const daysInMonth = mealEnd.getUTCDate();
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
                const wasCreated = !user.createdAt || user.createdAt <= dayEnd;
                if (wasCreated) {
                    const defL = user.defaultLunchStatus ? 1 : 0;
                    const defD = user.defaultDinnerStatus ? 1 : 0;
                    totalMeals += defL + defD;
                }
            }
        }

        const totalCost = parseFloat((totalMeals * rate).toFixed(2));
        const closingBalance = parseFloat((prevBalance + totalCredit - totalCost).toFixed(2));

        try {
            await prisma.monthlySnapshot.upsert({
                where: { userId_month: { userId: user.id, month: monthKey } },
                update: {
                    mealRate: rate,
                    totalMeals,
                    totalCost,
                    prevBalance,
                    totalCredit,
                    closingBalance
                },
                create: {
                    userId: user.id,
                    month: monthKey,
                    year,
                    monthNum,
                    mealRate: rate,
                    totalMeals,
                    totalCost,
                    prevBalance,
                    totalCredit,
                    closingBalance
                }
            });
        } catch (e) {
            console.error(`Failed to snapshot user ${user.id}`, e);
        }
    }

    revalidatePath('/dashboard/history');
    revalidatePath('/dashboard/admin/settings');
    revalidatePath('/dashboard');
    return { success: `Successfully processed ${users.length} users and finalized ${monthKey}.`, usersProcessed: users.length };
}
