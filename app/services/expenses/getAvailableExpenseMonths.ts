import { prisma } from '@/app/lib/prisma';

export async function getAvailableExpenseMonths() {
    const allExpenses = await prisma.expense.findMany({
        select: { date: true },
        orderBy: { date: 'desc' }
    });

    const months = new Set<string>();
    allExpenses.forEach(e => {
        const d = new Date(e.date.getTime() + 6 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 7); // YYYY-MM
        months.add(key);
    });

    return Array.from(months); // Already serializable
}
