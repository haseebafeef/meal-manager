'use client';

import { useState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { findAccount, verifyAndSend, attachEmailAndReset, type AuthState } from '@/app/lib/auth-actions';
import { AtSymbolIcon, ArrowLeftIcon, ExclamationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { Button } from '@/app/ui/button';

const initialState: AuthState = { message: '' };

export default function ForgotPasswordPage() {
    const [step, setStep] = useState<'IDENTIFY' | 'VERIFY' | 'ATTACH' | 'SUCCESS'>('IDENTIFY');
    const [context, setContext] = useState<{ userId?: string, mask?: string, message?: string }>({});

    // Actions
    const [findState, findAction] = useActionState(findAccount, initialState);
    const [verifyState, verifyAction] = useActionState(verifyAndSend, initialState);
    const [attachState, attachAction] = useActionState(attachEmailAndReset, initialState);

    // Effect to transition steps based on Server Action responses
    useEffect(() => {
        if (findState?.status === 'EMAIL_SENT') {
            // Use setTimeout to avoid synchronous state update warning (cascading render)
            setTimeout(() => {
                setContext({ message: findState.message });
                setStep('SUCCESS');
            }, 0);
        } else if (findState?.status === 'FOUND_WITH_EMAIL' && findState.data) {
            setTimeout(() => {
                setContext({ userId: findState.data!.userId, mask: findState.data!.mask });
                setStep('VERIFY');
            }, 0);
        } else if (findState?.status === 'FOUND_NO_EMAIL' && findState.data) {
            setTimeout(() => {
                setContext({ userId: findState.data!.userId, message: findState.message });
                setStep('ATTACH');
            }, 0);
        }
    }, [findState]);

    useEffect(() => {
        if (verifyState?.status === 'EMAIL_SENT') {
            setTimeout(() => {
                setContext(prev => ({ ...prev, message: verifyState.message }));
                setStep('SUCCESS');
            }, 0);
        }
    }, [verifyState]);

    useEffect(() => {
        if (attachState?.status === 'EMAIL_SENT') {
            setTimeout(() => {
                setContext(prev => ({ ...prev, message: attachState.message }));
                setStep('SUCCESS');
            }, 0);
        }
    }, [attachState]);


    return (
        <main className="flex items-center justify-center md:h-screen bg-gray-50 dark:bg-zinc-900 transition-colors">
            <div className="relative mx-auto flex w-full max-w-[400px] flex-col space-y-2.5 p-4 md:-mt-32">
                <div className="flex-1 rounded-xl bg-white dark:bg-zinc-800 px-6 pb-4 pt-8 shadow-sm border border-gray-100 dark:border-zinc-700">

                    {/* Header */}
                    <h1 className="mb-3 text-2xl font-bold text-gray-900 dark:text-white">
                        {step === 'SUCCESS' ? 'Check your Inbox' : 'Reset Password'}
                    </h1>

                    {/* STEP 1: IDENTIFY */}
                    {step === 'IDENTIFY' && (
                        <form action={findAction} className="space-y-3">
                            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                                Enter your email or phone number to find your account.
                            </p>
                            <div>
                                <label className="mb-2 block text-xs font-medium text-gray-900 dark:text-gray-300">
                                    Email or Phone
                                </label>
                                <div className="relative">
                                    <input
                                        className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500 text-gray-900 dark:bg-zinc-900 dark:border-zinc-700 dark:text-white"
                                        id="identifier"
                                        type="text"
                                        name="identifier"
                                        placeholder="e.g. user@gmail.com or 017..."
                                        required
                                    />
                                    <AtSymbolIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                                </div>
                            </div>
                            <SubmitButton label="Find Account" />
                            <ErrorMessage message={findState?.message} />
                        </form>
                    )}

                    {/* STEP 2: VERIFY (Phone + Existing Email) */}
                    {step === 'VERIFY' && (
                        <form action={verifyAction} className="space-y-3">
                            <input type="hidden" name="userId" value={context.userId} />
                            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                                We found an email attached: <span className="font-mono font-bold text-gray-800 dark:text-white">{context.mask}</span>
                            </p>
                            <p className="text-xs text-gray-500 mb-2">Please verify the full email address.</p>
                            <div>
                                <label className="mb-2 block text-xs font-medium text-gray-900 dark:text-gray-300">
                                    Confirm Email
                                </label>
                                <div className="relative">
                                    <input
                                        className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500 text-gray-900 dark:bg-zinc-900 dark:border-zinc-700 dark:text-white"
                                        type="email"
                                        name="email"
                                        placeholder="Enter your full email"
                                        required
                                    />
                                    <AtSymbolIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                                </div>
                            </div>
                            <SubmitButton label="Verify & Send Link" />
                            <ErrorMessage message={verifyState?.message} />
                            <button type="button" onClick={() => setStep('IDENTIFY')} className="w-full text-center text-xs text-gray-500 mt-2 hover:underline">
                                Start Over
                            </button>
                        </form>
                    )}

                    {/* STEP 3: ATTACH (Phone + No Email) */}
                    {step === 'ATTACH' && (
                        <form action={attachAction} className="space-y-3">
                            <input type="hidden" name="userId" value={context.userId} />
                            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg flex items-start gap-3 mb-4">
                                <ExclamationCircleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-500 shrink-0" />
                                <p className="text-xs text-yellow-700 dark:text-yellow-400">
                                    {context.message || "This account has no email attached."}
                                </p>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                                Please add an email address to secure your account and reset your password.
                            </p>
                            <div>
                                <label className="mb-2 block text-xs font-medium text-gray-900 dark:text-gray-300">
                                    New Email Address
                                </label>
                                <div className="relative">
                                    <input
                                        className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-base outline-2 placeholder:text-gray-500 text-gray-900 dark:bg-zinc-900 dark:border-zinc-700 dark:text-white"
                                        type="email"
                                        name="email"
                                        placeholder="Enter a valid email"
                                        required
                                    />
                                    <AtSymbolIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                                </div>
                            </div>
                            <SubmitButton label="Attach & Send Link" />
                            <ErrorMessage message={attachState?.message} />
                            <button type="button" onClick={() => setStep('IDENTIFY')} className="w-full text-center text-xs text-gray-500 mt-2 hover:underline">
                                Start Over
                            </button>
                        </form>
                    )}

                    {/* SUCCESS STATE */}
                    {step === 'SUCCESS' && (
                        <div className="text-center py-4">
                            <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
                            <p className="text-green-700 dark:text-green-400 font-medium mb-2">
                                {context.message}
                            </p>
                            <p className="text-sm text-gray-500 mb-6">
                                Please check your inbox (and spam folder) for the reset link.
                            </p>
                            <Link href="/login" className="btn-primary w-full block text-center py-2">
                                Return to Login
                            </Link>
                        </div>
                    )}

                    {step !== 'SUCCESS' && (
                        <div className="mt-6 text-center border-t border-gray-100 dark:border-zinc-700 pt-4">
                            <Link href="/login" className="flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">
                                <ArrowLeftIcon className="w-4 h-4" /> Back to Login
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}

function SubmitButton({ label }: { label: string }) {
    const { pending } = useFormStatus();

    return (
        <Button className="mt-4 w-full" aria-disabled={pending}>
            {pending ? 'Processing...' : label}
        </Button>
    );
}

function ErrorMessage({ message }: { message?: string }) {
    if (!message) return null;
    return (
        <div className="flex h-8 items-end space-x-1" aria-live="polite" aria-atomic="true">
            {!message.includes('sent') && (
                <>
                    <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
                    <p className="text-sm text-red-500">{message}</p>
                </>
            )}
        </div>
    );
}
