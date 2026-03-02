import { prisma } from '@/app/lib/prisma';

export async function getExpenses() {
    const twentyDaysAgo = new Date();
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

    const expenses = await prisma.expense.findMany({
        where: {
            date: { gte: twentyDaysAgo }
        },
        orderBy: { date: 'desc' },
        take: 10,
        include: { purchaser: { select: { name: true } } }
    });

    return expenses.map(e => ({
        ...e,
        date: e.date.toISOString() // Serialize for Server Actions
    }));
}
