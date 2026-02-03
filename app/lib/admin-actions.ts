'use server';

import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getUserSummary } from '@/app/lib/expense-actions';

export async function toggleAdminStatus(userId: string, currentStatus: boolean) {
    const session = await auth();
    if (!session?.user?.email) return { message: "Not authenticated" };

    const currentUser = await prisma.user.findUnique({
        where: { email: session.user.email }
    });

    if (!currentUser || !currentUser.isAdmin) {
        return { message: "Unauthorized: Admin access required." };
    }

    try {
        await prisma.user.update({
            where: { id: userId },
            data: { isAdmin: !currentStatus }
        });
        revalidatePath('/dashboard/admin/users');
        return { message: `User status updated to ${!currentStatus ? 'Admin' : 'User'}` };
    } catch (error) {
        console.error("Toggle Admin Error:", error);
        return { message: "Database error" };
    }
}

export async function toggleUserStatus(userId: string, currentStatus: string) {
    const session = await auth();
    if (!session?.user?.email) return { message: "Not authenticated" };

    const currentUser = await prisma.user.findUnique({
        where: { email: session.user.email }
    });

    if (!currentUser || !currentUser.isAdmin) {
        return { message: "Unauthorized: Admin access required." };
    }

    const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';

    try {
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
        revalidatePath('/dashboard/admin/users');
        return { message: `User status updated to ${newStatus}` };
    } catch (error) {
        console.error("Toggle Status Error:", error);
        return { message: "Database error" };
    }
}

export async function getAllUsers() {
    const session = await auth();
    if (!session?.user?.email) return null;

    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser?.isAdmin) return null;

    const users = await prisma.user.findMany({
        orderBy: { name: 'asc' },
        select: {
            id: true,
            name: true,
            email: true,
            image: true,
            isAdmin: true,
            status: true,
            balance: true
        }
    });

    // Calculate Net Balance for each user
    const usersWithNetBalance = await Promise.all(users.map(async (user) => {
        const summary = await getUserSummary(user.id);
        return {
            ...user,
            balance: summary.remainingBalance // Overlay raw balance with Net/Remaining
        };
    }));

    return usersWithNetBalance;
}
