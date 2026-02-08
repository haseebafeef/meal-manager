'use server';

import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

interface PushSubscriptionInput {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}

export async function subscribeUser(sub: PushSubscriptionInput) {
    const session = await auth();
    if (!session?.user?.email) {
        throw new Error('Not authenticated');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;

    try {
        await prisma.pushSubscription.create({
            data: {
                userId,
                endpoint: sub.endpoint,
                keys: sub.keys,
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
            },
        });
        return { success: true };
    } catch (error) {
        console.error('Error saving subscription:', error);
        // If unique constraint failed, it might already exist, which is fine.
        return { success: false, error: 'Failed to save subscription' };
    }
}

export async function unsubscribeUser(endpoint: string) {
    const session = await auth();
    if (!session?.user) return;

    try {
        await prisma.pushSubscription.deleteMany({
            where: { endpoint },
        });
        return { success: true };
    } catch (error) {
        console.error('Error deleting subscription:', error);
        return { success: false };
    }
}

export async function checkSubscription(endpoint: string) {
    const session = await auth();
    if (!session?.user) return false;

    const sub = await prisma.pushSubscription.findUnique({
        where: { endpoint },
    });

    return !!sub;
}
