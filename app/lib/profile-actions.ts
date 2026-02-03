'use server';

import { z } from 'zod';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';

import { prisma } from '@/app/lib/prisma';

const ProfileSchema = z.object({
    name: z.string().min(2),
    nickname: z.string().optional().or(z.literal('')),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().min(10),
});



import { put } from '@vercel/blob';



// Update user profile information including name, email, phone, AND image.
export async function updateProfile(prevState: { message: string } | undefined, formData: FormData) {
    const session = await auth();
    if (!session?.user) return { message: "Not authenticated" };

    const userId = session.user.id;
    const userEmail = session.user.email;

    const whereClause = userId ? { id: userId } : { email: userEmail! };

    const validatedFields = ProfileSchema.safeParse({
        name: formData.get('name'),
        nickname: formData.get('nickname'),
        email: formData.get('email'),
        phone: formData.get('phone'),
    });

    if (!validatedFields.success) return { message: "Invalid Fields" };

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
            // Fallback: Upload original if sharp fails for some reason, or just error out?
            // Safer to just error log and continue or fail? 
            // Let's try to upload original as fallback or just fail.
            // Failing is better to avoid massive files if that's the goal.
            return { message: "Failed to process image." };
        }
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {
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
        return { message: "Database Error: Phone or Email might be used by another account." };
    }

    revalidatePath('/dashboard');
    return { message: "Profile Updated Successfully!" };
}

export async function updatePassword(prevState: { message: string } | undefined, formData: FormData) {
    const session = await auth();
    if (!session?.user?.email) return { message: "Not authenticated" };

    const currentPassword = formData.get('currentPassword') as string;
    const newPassword = formData.get('newPassword') as string;

    if (!newPassword || newPassword.length < 6) return { message: "New password must be at least 6 characters." };

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return { message: "User not found" };

    if (user.password) {
        // User has a password, so current password is required
        if (!currentPassword) return { message: "Current password is required." };
        const match = await bcrypt.compare(currentPassword, user.password);
        if (!match) return { message: "Current password incorrect" };
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
        where: { email: session.user.email },
        data: { password: hashed }
    });

    revalidatePath('/dashboard/profile');
    return { message: user.password ? "Password Updated Successfully!" : "Password Set Successfully!" };
}

export async function unlinkGoogleAccount() {
    const session = await auth();
    if (!session?.user?.email) return { message: "Not authenticated" };

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { accounts: true }
    });

    if (!user) return { message: "User not found" };

    // 1. Check if user has a password set
    if (!user.password) {
        return { message: "Cannot unlink Google Account: No password set. Set a password first to avoid being locked out." };
    }

    // 2. Check if Google account exists
    const googleAccount = user.accounts.find(a => a.provider === 'google');
    if (!googleAccount) {
        return { message: "No Google account linked." };
    }

    // 3. Delete the account connection
    await prisma.account.delete({
        where: { id: googleAccount.id }
    });

    revalidatePath('/dashboard/profile');
    return { message: "Google Account unlinked successfully." };
}
