'use client';

import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { requestPasswordReset } from '@/app/lib/auth-actions';
import { AtSymbolIcon, ExclamationCircleIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { Button } from '@/app/ui/button';

export default function ForgotPasswordPage() {
    const [state, dispatch] = useActionState(requestPasswordReset, { message: '' });

    return (
        <main className="flex items-center justify-center md:h-screen">
            <div className="relative mx-auto flex w-full max-w-[400px] flex-col space-y-2.5 p-4 md:-mt-32">
                <form action={dispatch} className="space-y-3">
                    <div className="flex-1 rounded-lg bg-gray-50 px-6 pb-4 pt-8">
                        <h1 className="mb-3 text-2xl text-gray-900">
                            Forgot Password?
                        </h1>
                        <p className="mb-4 text-sm text-gray-500">
                            Enter your email address and we&apos;ll send you a link to reset your password.
                        </p>

                        <div className="w-full">
                            <div>
                                <label
                                    className="mb-3 mt-5 block text-xs font-medium text-gray-900"
                                    htmlFor="email"
                                >
                                    Email
                                </label>
                                <div className="relative">
                                    <input
                                        className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500 text-gray-900"
                                        id="email"
                                        type="email"
                                        name="email"
                                        placeholder="Enter your email address"
                                        required
                                    />
                                    <AtSymbolIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                                </div>
                            </div>
                        </div>

                        <SubmitButton />

                        <div className="flex h-8 items-end space-x-1" aria-live="polite" aria-atomic="true">
                            {state?.message && (
                                <>
                                    {state.message.includes('sent') ? (
                                        <p className="text-sm text-green-600">{state.message}</p>
                                    ) : (
                                        <>
                                            <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
                                            <p className="text-sm text-red-500">{state.message}</p>
                                        </>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="mt-4 text-center">
                            <Link href="/login" className="flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900">
                                <ArrowLeftIcon className="w-4 h-4" /> Back to Login
                            </Link>
                        </div>
                    </div>
                </form>
            </div>
        </main>
    );
}

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button className="mt-4 w-full" aria-disabled={pending}>
            {pending ? 'Sending...' : 'Send Reset Link'}
        </Button>
    );
}
