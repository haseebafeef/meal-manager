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

    if (process.env.NODE_ENV === 'development') {
        console.log('RESET LINK (Simulated):', resetLink);
    }



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
            console.error('[Configuration] Gmail credentials (GMAIL_USER / GMAIL_APP_PASSWORD) are missing. Email not sent.');
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

// --- HYBRID FLOW ACTIONS ---

export type AuthState = {
    message: string;
    status?: 'EMAIL_SENT' | 'FOUND_WITH_EMAIL' | 'FOUND_NO_EMAIL' | 'NOT_FOUND';
    data?: {
        userId?: string;
        mask?: string;
    };
};



export async function findAccount(prevState: AuthState | undefined, formData: FormData): Promise<AuthState> {
    const identifier = formData.get('identifier') as string;

    if (!identifier) return { message: "Please enter email or phone." };

    // 1. Determine Type
    const isEmail = identifier.includes('@');

    let user;
    if (isEmail) {
        user = await prisma.user.findUnique({ where: { email: identifier } });
    } else {
        user = await prisma.user.findUnique({ where: { phone: identifier } });
    }

    if (!user) {
        // Security: Don't reveal too much, but for this specific "Hostel/Community" app, 
        // useful feedback is prioritized over strict enumeration protection as requested.
        // We will return generic "Found" for standard email flow to allow the standard UI to handle it,
        // BUT if it's phone flow, we need specific steps.

        if (isEmail) {
            // Trick: If email input, just trigger the standard "Email Sent" fakeout.
            // But the UI wizard expects a status.
            return { status: 'NOT_FOUND', message: 'No account found with this credential.' };
        }
        return { status: 'NOT_FOUND', message: 'Phone number not found.' };
    }

    // 2. User Found
    if (isEmail) {
        // Standard Email Flow -> Trigger Send immediately
        await sendResetEmailInternal(user.email!);
        return { status: 'EMAIL_SENT', message: `Reset link sent to ${maskEmail(user.email!)}` };
    } else {
        // Phone Flow
        if (user.email) {
            // Case A: Has Email
            return {
                status: 'FOUND_WITH_EMAIL',
                data: {
                    mask: maskEmail(user.email),
                    userId: user.id
                },
                message: 'Account found.'
            };
        } else {
            // Case B: No Email
            return {
                status: 'FOUND_NO_EMAIL',
                data: { userId: user.id },
                message: 'No email attached to this phone number.'
            };
        }
    }
}

export async function verifyAndSend(prevState: AuthState | undefined, formData: FormData): Promise<AuthState> {
    const userId = formData.get('userId') as string;
    const confirmEmail = formData.get('email') as string;

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.email) return { message: "Account error." };

    if (user.email.toLowerCase() !== confirmEmail.toLowerCase()) {
        return { message: "Email does not match our records." };
    }

    await sendResetEmailInternal(user.email);
    return { status: 'EMAIL_SENT', message: "Verified! Reset link sent." };
}

export async function attachEmailAndReset(prevState: AuthState | undefined, formData: FormData): Promise<AuthState> {
    const userId = formData.get('userId') as string;
    const newEmail = formData.get('email') as string;

    // Validate Email
    const emailParsed = z.string().email().safeParse(newEmail);
    if (!emailParsed.success) return { message: "Invalid email format." };

    // Check if email taken
    const existing = await prisma.user.findUnique({ where: { email: newEmail } });
    if (existing) return { message: "This email is already used by another account." };

    // Update User
    await prisma.user.update({
        where: { id: userId },
        data: { email: newEmail }
    });

    // Send
    await sendResetEmailInternal(newEmail);

    if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV] Email ${newEmail} attached to user ${userId} via Recovery Flow`);
    }

    return { status: 'EMAIL_SENT', message: "Email attached & Link sent!" };
}


// --- INTERNAL HELPERS ---

function maskEmail(email: string) {
    const [local, domain] = email.split('@');
    if (local.length <= 2) return `${local}***@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
}

async function sendResetEmailInternal(email: string) {
    // Generate Token
    const token = uuidv4();
    const expires = new Date(new Date().getTime() + 3600 * 1000); // 1 hour

    // Delete existing tokens
    await prisma.passwordResetToken.deleteMany({ where: { email } });

    // Create new token
    await prisma.passwordResetToken.create({
        data: { email, token, expires },
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
        console.error("NEXT_PUBLIC_BASE_URL missing");
        return;
    }

    const resetLink = `${baseUrl}/reset-password?token=${token}`;
    console.log('RESET LINK:', resetLink);

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
        }
    } catch (e) {
        console.error("Email send failed:", e);
    }
}
