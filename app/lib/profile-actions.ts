'use server';

import { z } from 'zod';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { put } from '@vercel/blob';

import { prisma } from '@/app/lib/prisma';

const ProfileSchema = z.object({
    name: z.string().min(2),
    nickname: z.string().optional().or(z.literal('')),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().min(10),
});

// Update user profile information including name, email, phone, AND image.
export async function updateProfile(prevState: unknown, formData: FormData): Promise<{ success?: string; error?: string }> {
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };

    const userId = session.user.id;
    const userEmail = session.user.email;

    const whereClause = userId ? { id: userId } : { email: userEmail! };

    const validatedFields = ProfileSchema.safeParse({
        name: formData.get('name'),
        nickname: formData.get('nickname'),
        email: formData.get('email'),
        phone: formData.get('phone'),
    });

    if (!validatedFields.success) return { error: "Invalid Fields" };

    const { name, nickname, email, phone } = validatedFields.data;
    const emailToSave = email === '' ? null : email;
    const nicknameToSave = nickname === '' ? null : nickname;

    let imageUrl: string | undefined;

    // Handle Image Upload
    const imageFile = formData.get('image') as File;
    if (imageFile && imageFile.size > 0) {
        try {
            const buffer = Buffer.from(await imageFile.arrayBuffer());
            const resizedBuffer = await sharp(buffer)
                .rotate() // Auto-rotate based on EXIF
                .resize(600, 600, { fit: 'inside' }) // Max 600x600, preserve aspect ratio
                .jpeg({ quality: 80 }) // Compress to JPEG 80%
                .toBuffer();

            const blob = await put(imageFile.name, resizedBuffer, {
                access: 'public',
                contentType: 'image/jpeg',
            });
            imageUrl = blob.url;
        } catch (error) {
            console.error('Image upload/compression failed:', error);
            return { error: "Failed to process image." };
        }
    }

    try {
        const updateData: { name: string; nickname?: string | null; email?: string | null; phone: string; image?: string } = {
            name,
            nickname: nicknameToSave,
            email: emailToSave,
            phone
        };

        if (imageUrl) {
            updateData.image = imageUrl;
        }

        await prisma.user.update({
            where: whereClause,
            data: updateData
        });
    } catch (error) {
        console.error(error);
        return { error: "Database Error: Phone or Email might be used by another account." };
    }

    revalidatePath('/dashboard');
    return { success: "Profile Updated Successfully!" };
}

export async function updatePassword(prevState: unknown, formData: FormData): Promise<{ success?: string; error?: string }> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    const currentPassword = formData.get('currentPassword') as string;
    const newPassword = formData.get('newPassword') as string;

    if (!newPassword || newPassword.length < 6) return { error: "New password must be at least 6 characters." };

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return { error: "User not found" };

    if (user.password) {
        // User has a password, so current password is required
        if (!currentPassword) return { error: "Current password is required." };
        const match = await bcrypt.compare(currentPassword, user.password);
        if (!match) return { error: "Current password incorrect" };
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
        where: { email: session.user.email },
        data: { password: hashed }
    });

    revalidatePath('/dashboard/profile');
    return { success: user.password ? "Password Updated Successfully!" : "Password Set Successfully!" };
}

export async function unlinkGoogleAccount(): Promise<{ success?: string; error?: string }> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { accounts: true }
    });

    if (!user) return { error: "User not found" };

    // 1. Check if user has a password set
    if (!user.password) {
        return { error: "Cannot unlink Google Account: No password set. Set a password first to avoid being locked out." };
    }

    // 2. Check if Google account exists
    const googleAccount = user.accounts.find(a => a.provider === 'google');
    if (!googleAccount) {
        return { error: "No Google account linked." };
    }

    // 3. Delete the account connection
    await prisma.account.delete({
        where: { id: googleAccount.id }
    });

    revalidatePath('/dashboard/profile');
    return { success: "Google Account unlinked successfully." };
}
