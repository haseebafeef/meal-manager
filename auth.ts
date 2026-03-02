import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { z } from 'zod';
import { prisma } from '@/app/lib/prisma';
import bcrypt from 'bcryptjs';

export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    adapter: PrismaAdapter(prisma) as any,
    session: { strategy: 'jwt' },
    callbacks: {
        async jwt({ token, user }) {
            console.log('JWT Callback:', { token, user });
            if (user) {
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            console.log('Session Callback:', { session, token });
            if (token?.id) {
                // @ts-expect-error: session.user type is extended in next-auth.d.ts but TS doesn't see it here
                session.user.id = token.id;
            }
            return session;
        },
    },
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
        }),
        Credentials({
            async authorize(credentials) {
                const parsedCredentials = z
                    .object({ identifier: z.string(), password: z.string().min(6) })
                    .safeParse(credentials);

                if (parsedCredentials.success) {
                    const { identifier, password } = parsedCredentials.data;
                    console.log('Authorize: Checking user', identifier);
                    const user = await prisma.user.findFirst({
                        where: {
                            OR: [
                                { email: identifier },
                                { phone: identifier }
                            ]
                        }
                    });

                    if (!user || !user.password) {
                        console.log('Authorize: User not found or no password');
                        return null;
                    }
                    const passwordsMatch = await bcrypt.compare(password, user.password);

                    if (passwordsMatch) {
                        // Status Check
                        if (user.status !== 'Active') {
                            console.log('Authorize: User is inactive');
                            return null;
                        }
                        console.log('Authorize: Success', user.id);
                        return user as any;
                    }
                    console.log('Authorize: Password mismatch');
                }

                console.log('Invalid credentials schema');
                return null;
            },
        }),
    ],
});
