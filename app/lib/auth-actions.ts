'use server';

import { z } from 'zod';
import { prisma } from '@/app/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { signOut } from '@/auth';

// Auth actions for password management and session handling
export async function signOutAction() {
    await signOut();
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
    },
});

const ForgotPasswordSchema = z.object({
    email: z.string().email(),
});

const ResetPasswordSchema = z.object({
    password: z.string().min(6),
    confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});

export async function requestPasswordReset(prevState: { message: string } | undefined, formData: FormData) {
    const validatedFields = ForgotPasswordSchema.safeParse({
        email: formData.get('email'),
    });

    if (!validatedFields.success) {
        return { message: 'Invalid email address.' };
    }

    const { email } = validatedFields.data;

    const user = await prisma.user.findUnique({
        where: { email },
    });

    // Handle cases where the user does not exist or uses external auth providers.
    // A generic response is returned to prevent account enumeration.
    if (!user || !user.password) {
        return { message: 'If an account exists with this email, a reset link has been sent.' };
    }

    // Generate Token
    const token = uuidv4();
    const expires = new Date(new Date().getTime() + 3600 * 1000); // 1 hour

    // Delete existing tokens
    await prisma.passwordResetToken.deleteMany({
        where: { email },
    });

    // Create new token
    await prisma.passwordResetToken.create({
        data: {
            email,
            token,
            expires,
        },
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (!baseUrl) {
        console.error("NEXT_PUBLIC_BASE_URL is not defined");
        return { message: "System configuration error. Please contact support." };
    }

    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    console.log('RESET LINK (Simulated):', resetLink); // Keep for dev backup

    try {
        if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
            await transporter.sendMail({
                from: `"Meal Manager" <${process.env.GMAIL_USER}>`,
                to: email,
                subject: 'Reset your password - Meal Manager',
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Password Reset Request</h2>
                        <p>You have requested to reset your password for Meal Manager.</p>
                        <p>Click the button below to set a new password:</p>
                        <a href="${resetLink}" style="display: inline-block; background-color: #2563EB; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 10px 0;">Reset Password</a>
                        <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
                        <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
                    </div>
                `,
            });
        } else {
            console.log('Gmail credentials not found. Email not sent.');
        }
    } catch (error) {
        console.error('Failed to send email:', error);
        return { message: 'Failed to send email. Please try again later.' };
    }

    return { message: 'If an account exists with this email, a reset link has been sent.' };
}

export async function resetPassword(token: string, prevState: { message: string } | undefined, formData: FormData) {
    if (!token) return { message: "Missing token" };

    const validatedFields = ResetPasswordSchema.safeParse({
        password: formData.get('password'),
        confirmPassword: formData.get('confirmPassword'),
    });

    if (!validatedFields.success) {
        return { message: validatedFields.error.flatten().fieldErrors.confirmPassword?.[0] || 'Invalid password.' };
    }

    const { password } = validatedFields.data;

    // Verify Token
    const existingToken = await prisma.passwordResetToken.findUnique({
        where: { token },
    });

    if (!existingToken) {
        return { message: "Invalid or expired token." };
    }

    const hasExpired = new Date() > existingToken.expires;
    if (hasExpired) {
        return { message: "Token has expired. Please request a new one." };
    }

    // Update User Password
    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
        where: { email: existingToken.email },
        data: { password: hashedPassword },
    });

    // Delete Token
    await prisma.passwordResetToken.delete({
        where: { id: existingToken.id },
    });

    return { message: "Password Reset Successfully! You can now login." };
}
