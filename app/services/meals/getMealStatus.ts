import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { endOfMonth, addMonths } from 'date-fns';

export async function getMealStatus(targetUserId?: string) {
    const session = await auth();
    if (!session?.user) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userId = (session.user as any).id;
    if (!userId && session.user.email) {
        const user = await prisma.user.findFirst({
            where: { email: session.user.email }
        });
        userId = user?.id;
    }

    if (targetUserId) {
        const currentUser = await prisma.user.findUnique({ where: { id: userId } });
        if (currentUser?.isAdmin) {
            userId = targetUserId;
        } else {
            return [];
        }
    }

    if (!userId) return [];

    const now = new Date();
    const systemEpoch = new Date(Date.UTC(2026, 1, 1));
    const start = systemEpoch;
    const end = endOfMonth(addMonths(now, 6));

    const statuses = await prisma.mealStatus.findMany({
        where: {
            userId: userId,
            date: {
                gte: start,
                lte: end,
            },
        },
    });

    // Serialize Date for Server Actions
    return statuses.map(s => ({
        ...s,
        date: s.date.toISOString(),
    }));
}
