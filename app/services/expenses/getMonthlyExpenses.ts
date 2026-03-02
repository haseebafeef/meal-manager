import { prisma } from '@/app/lib/prisma';

export async function getMonthlyExpenses(year: number, month: number) {
    const startDhaka = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    const startUTC = new Date(startDhaka.getTime() - 6 * 60 * 60 * 1000);

    const endDhaka = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
    const endUTC = new Date(endDhaka.getTime() - 6 * 60 * 60 * 1000);

    const expenses = await prisma.expense.findMany({
        where: {
            date: {
                gte: startUTC,
                lte: endUTC
            }
        },
        orderBy: { date: 'desc' },
        include: {
            purchaser: {
                select: { name: true, nickname: true }
            }
        }
    });

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);

    return {
        expenses: expenses.map(e => ({
            id: e.id,
            date: e.date.toISOString(), // Serialize for Server Actions
            description: e.description,
            amount: e.amount,
            volume: e.volume,
            unit: e.unit,
            unitPrice: e.unitPrice,
            imagePath: e.imagePath,
            purchaserName: e.purchaser.nickname || e.purchaser.name,
        })),
        total
    };
}
