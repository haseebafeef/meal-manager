'use server';

import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';

export async function toggleNotificationPermission(userId: string, isEnabled: boolean) {
    const session = await auth();
    const currentUser = await prisma.user.findUnique({ where: { email: session?.user?.email || '' } });

    if (!currentUser || !currentUser.isAdmin) {
        throw new Error('Unauthorized');
    }

    try {
        await prisma.user.update({
            where: { id: userId },
            data: { receiveDailyReports: isEnabled }
        });
        revalidatePath('/dashboard/admin/notifications');
        return { success: true };
    } catch (error) {
        console.error('Error toggling permission:', error);
        return { success: false, error: 'Failed to update' };
    }
}
