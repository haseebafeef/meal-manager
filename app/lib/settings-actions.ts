'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';

import { prisma } from '@/app/lib/prisma';

import { DEFAULT_SETTINGS } from './constants';

export async function getSystemSettings() {
    const session = await auth();
    if (!session?.user) return null;

    // Fetch all settings
    const settings = await prisma.systemSettings.findMany();

    // Map to object for easier access
    const settingsMap: Record<string, string> = {};
    settings.forEach(s => settingsMap[s.key] = s.value);

    // Ensure defaults exist for known keys
    const finalSettings = { ...DEFAULT_SETTINGS, ...settingsMap };

    return finalSettings;
}

export async function updateSystemSetting(key: string, value: string) {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user?.isAdmin) return { error: "Unauthorized" };

    try {
        await prisma.systemSettings.upsert({
            where: { key: key },
            update: { value: value },
            create: { key: key, value: value }
        });

        revalidatePath('/dashboard/admin/settings');
        revalidatePath('/dashboard/meals');
        return { message: "Setting updated successfully" };
    } catch (error) {
        console.error("Failed to update setting:", error);
        return { message: "Failed to update setting" };
    }
}
