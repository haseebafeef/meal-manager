import { prisma } from '@/app/lib/prisma';
import { revalidatePath, revalidateTag } from 'next/cache';
import { SETTINGS_KEYS } from '@/app/lib/constants';
import { getUserSummary } from '@/app/services/expenses/userSummary';

export async function syncUserStatus(userId: string, existingSettingsMap?: Map<string, string>) {
    let settingsMap = existingSettingsMap;
    if (!settingsMap) {
        const settings = await prisma.systemSettings.findMany();
        settingsMap = new Map(settings.map(s => [s.key, s.value]));
    }

    const threshold = parseFloat(settingsMap.get(SETTINGS_KEYS.AUTO_OFF_THRESHOLD) || '-300');

    const summary = await getUserSummary(userId, settingsMap);
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { status: true }
    });

    if (!user) return;

    let newStatus: string | null = null;

    if (summary.remainingBalance < threshold && user.status === 'Active') {
        newStatus = 'Inactive';
    } else if (summary.remainingBalance >= 0 && user.status === 'Inactive') {
        newStatus = 'Active';
    }

    if (newStatus) {
        await prisma.$transaction([
            prisma.user.update({
                where: { id: userId },
                data: { status: newStatus }
            }),
            prisma.userStatusLog.create({
                data: {
                    userId: userId,
                    status: newStatus
                }
            })
        ]);
        revalidateTag('users', 'default');
        revalidatePath('/dashboard/admin/users');
        revalidatePath('/dashboard/meals');
    }
}
