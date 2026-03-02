import { prisma } from '@/app/lib/prisma';

export async function getDetailedExpenses() {
    const expenses = await prisma.expense.findMany({
        orderBy: { date: 'desc' },
        include: {
            purchaser: {
                select: { name: true, nickname: true }
            }
        }
    });

    return expenses.map(e => ({
        id: e.id,
        date: e.date.toISOString(), // Serialize for Server Actions
        description: e.description,
        volume: e.volume || '-',
        unit: e.unit || 0,
        unitPrice: e.unitPrice || 0,
        amount: e.amount,
        purchaser: e.purchaser.nickname || e.purchaser.name,
        memo: e.description
    }));
}
