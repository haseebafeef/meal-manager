import { prisma } from '@/app/lib/prisma';
import { getStartOfMonthDhaka } from '@/app/lib/utils';
import { APP_LAUNCH_UTC } from '@/app/lib/constants';

export async function getSystemSummary() {
    const dhakaStart = getStartOfMonthDhaka();
    const queryStart = new Date(dhakaStart.getTime() - 6 * 60 * 60 * 1000);

    const [currentMonthExpenses, currentMonthCreditData, prevExpenses, prevCredit] = await prisma.$transaction([
        prisma.expense.aggregate({
            where: {
                date: { gte: queryStart }
            },
            _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
            where: {
                createdAt: { gte: queryStart },
                status: 'APPROVED'
            },
            _sum: { amount: true }
        }),
        prisma.expense.aggregate({
            where: { date: { gte: APP_LAUNCH_UTC, lt: queryStart } },
            _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
            where: {
                createdAt: { gte: APP_LAUNCH_UTC, lt: queryStart },
                status: 'APPROVED'
            },
            _sum: { amount: true }
        })
    ]);

    const totalExpensesCurrent = currentMonthExpenses._sum.amount || 0;
    const totalCreditCurrent = currentMonthCreditData._sum.amount || 0;
    const prevBalance = (prevCredit._sum.amount || 0) - (prevExpenses._sum.amount || 0);

    const remainingFund = prevBalance + totalCreditCurrent - totalExpensesCurrent;

    return {
        previousMonthBalance: prevBalance,
        currentMonthCredit: totalCreditCurrent,
        currentMonthExpenses: totalExpensesCurrent,
        remainingFund: remainingFund
    };
}
