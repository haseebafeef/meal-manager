'use server'

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/app/lib/prisma';
import bcrypt from 'bcryptjs';

const SignupSchema = z.object({
    name: z.string().min(2),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().min(10),
    password: z.string().min(6),
});

export async function signup(prevState: { message: string } | undefined, formData: FormData) {
    const validatedFields = SignupSchema.safeParse({
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        password: formData.get('password'),
    });

    if (!validatedFields.success) {
        return { message: 'Missing Fields. Failed to Create Account.' };
    }

    const { name, email, phone, password } = validatedFields.data;

    // Ensure email is null if empty string to avoid unique constraint violation
    const emailToSave = email === '' ? null : email;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: {
                name,
                email: emailToSave,
                phone,
                password: hashedPassword,
                balance: 0,
            },
        });
    } catch (error) {
        console.error(error);
        return { message: 'Database Error: Failed to Create User. (Email or Phone might already exist)' };
    }

    try {
        // const redirect = false; // We can handle redirect manually or let it throw
        // We need to map 'email' or 'phone' to 'identifier' for the auth logic
        const loginData = new FormData();
        loginData.append('identifier', email || phone);
        loginData.append('password', password);
        loginData.append('redirectTo', '/dashboard'); // FORCE redirect

        await signIn('credentials', loginData);
    } catch (error) {
        if (error instanceof AuthError) {
            return { message: 'Something went wrong during auto-login.' };
        }
        throw error;
    }
}

export async function authenticate(
    prevState: { message: string } | undefined,
    formData: FormData,
) {
    try {
        // Append explicit redirect
        if (!formData.has('redirectTo')) {
            formData.append('redirectTo', '/dashboard');
        }
        await signIn('credentials', formData);
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return { message: 'Invalid credentials.' };
                default:
                    return { message: 'Something went wrong.' };
            }
        }
        throw error;
    }
}

export async function googleAuthenticate() {
    await signIn('google');
}
