'use server';

import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';

export async function updateUserTag(userId: string, tag: string) {
    const session = await auth();
    if (!session?.user?.email) throw new Error('Unauthorized');

    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser?.isAdmin) throw new Error('Forbidden');

    await prisma.user.update({
        where: { id: userId },
        data: { tag }
    });

    revalidatePath('/dashboard/admin/users');
}
