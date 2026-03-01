'use client';

import { Suspense } from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { resetPassword } from '@/app/lib/auth-actions';
import { KeyIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { Button } from '@/app/ui/button';
import { useSearchParams } from 'next/navigation';

function ResetPasswordContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    // We bind the token to the server action
    const resetPasswordWithToken = resetPassword.bind(null, token || '');
    const [state, dispatch] = useActionState(resetPasswordWithToken, { success: '', error: '' });

    if (!token) {
        return (
            <main className="flex items-center justify-center md:h-screen">
                <div className="relative mx-auto flex w-full max-w-[400px] flex-col space-y-2.5 p-4 md:-mt-32">
                    <div className="flex-1 rounded-lg bg-gray-50 px-6 pb-4 pt-8 text-center">
                        <h1 className="mb-3 text-2xl text-red-600">Invalid Link</h1>
                        <p className="text-gray-500 mb-4">This password reset link is invalid or missing.</p>
                        <Link href="/login" className="text-blue-600 hover:underline">Return to Login</Link>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="flex items-center justify-center md:h-screen">
            <div className="relative mx-auto flex w-full max-w-[400px] flex-col space-y-2.5 p-4 md:-mt-32">
                <form action={dispatch} className="space-y-3">
                    <div className="flex-1 rounded-lg bg-gray-50 px-6 pb-4 pt-8">
                        <h1 className="mb-3 text-2xl text-gray-900">
                            Reset Password
                        </h1>
                        <p className="mb-4 text-sm text-gray-500">
                            Enter your new password below.
                        </p>

                        <div className="w-full">
                            <div>
                                <label
                                    className="mb-3 mt-5 block text-xs font-medium text-gray-900"
                                    htmlFor="password"
                                >
                                    New Password
                                </label>
                                <div className="relative">
                                    <input
                                        className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500 text-gray-900"
                                        id="password"
                                        type="password"
                                        name="password"
                                        placeholder="Enter new password"
                                        required
                                        minLength={6}
                                    />
                                    <KeyIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                                </div>
                            </div>

                            <div className="mt-4">
                                <label
                                    className="mb-3 mt-5 block text-xs font-medium text-gray-900"
                                    htmlFor="confirmPassword"
                                >
                                    Confirm Password
                                </label>
                                <div className="relative">
                                    <input
                                        className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500 text-gray-900"
                                        id="confirmPassword"
                                        type="password"
                                        name="confirmPassword"
                                        placeholder="Confirm new password"
                                        required
                                        minLength={6}
                                    />
                                    <KeyIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                                </div>
                            </div>
                        </div>

                        <SubmitButton />

                        <div className="flex h-8 items-end space-x-1" aria-live="polite" aria-atomic="true">
                            {state?.success && (
                                <div className="flex flex-col">
                                    <p className="text-sm text-green-600">{state.success}</p>
                                    <Link href="/login" className="text-blue-600 text-sm mt-1 hover:underline">Login now</Link>
                                </div>
                            )}
                            {state?.error && (
                                <>
                                    <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
                                    <p className="text-sm text-red-500">{state.error}</p>
                                </>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </main>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div className="flex justify-center p-8">Loading...</div>}>
            <ResetPasswordContent />
        </Suspense>
    );
}

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button className="mt-4 w-full" aria-disabled={pending}>
            {pending ? 'Resetting...' : 'Reset Password'}
        </Button>
    );
}
