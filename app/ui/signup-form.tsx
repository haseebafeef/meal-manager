'use client';

import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { signup, googleAuthenticate } from '@/app/lib/actions';
import { AtSymbolIcon, KeyIcon, ExclamationCircleIcon, UserIcon, DevicePhoneMobileIcon } from '@heroicons/react/24/outline';
import { ArrowRightIcon } from '@heroicons/react/20/solid';
import { Button } from './button';
import Link from 'next/link';

export default function SignupForm() {
    const [state, dispatch] = useActionState(signup, { success: '', error: '' });

    return (
        <div className="space-y-3">
            <div className="flex-1 rounded-lg bg-gray-50 px-6 pb-4 pt-8">
                <h1 className="mb-3 text-2xl text-gray-900">
                    Create an account
                </h1>

                <form action={dispatch}>
                    <div className="w-full">
                        {/* Name */}
                        <div>
                            <label className="mb-2 mt-3 block text-xs font-medium text-gray-900" htmlFor="name">
                                Name
                            </label>
                            <div className="relative">
                                <input
                                    className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500 text-gray-900"
                                    id="name"
                                    type="text"
                                    name="name"
                                    placeholder="Enter your name"
                                    required
                                />
                                <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label className="mb-2 mt-3 block text-xs font-medium text-gray-900" htmlFor="email">
                                Email (Optional)
                            </label>
                            <div className="relative">
                                <input
                                    className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500 text-gray-900"
                                    id="email"
                                    type="email"
                                    name="email"
                                    placeholder="Enter your email address"
                                />
                                <AtSymbolIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                            </div>
                        </div>

                        {/* Phone */}
                        <div>
                            <label className="mb-2 mt-3 block text-xs font-medium text-gray-900" htmlFor="phone">
                                Phone
                            </label>
                            <div className="relative">
                                <input
                                    className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500 text-gray-900"
                                    id="phone"
                                    type="tel"
                                    name="phone"
                                    placeholder="Enter your phone number"
                                    required
                                />
                                <DevicePhoneMobileIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                            </div>
                        </div>

                        {/* Password */}
                        <div className="mt-3">
                            <label className="mb-2 mt-3 block text-xs font-medium text-gray-900" htmlFor="password">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500 text-gray-900"
                                    id="password"
                                    type="password"
                                    name="password"
                                    placeholder="Enter password"
                                    required
                                    minLength={6}
                                />
                                <KeyIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                            </div>
                        </div>
                    </div>
                    <SignupButton />

                    <div className="flex items-end space-x-1" aria-live="polite" aria-atomic="true">
                        {state?.error && (
                            <>
                                <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
                                <p className="text-sm text-red-500">{state.error}</p>
                            </>
                        )}
                        {state?.success && (
                            <p className="text-sm text-green-500">{state.success}</p>
                        )}
                    </div>
                </form>

                <div className="flex items-center my-2">
                    <div className="flex-grow border-t border-gray-300"></div>
                    <span className="flex-shrink-0 mx-4 text-gray-500 text-sm">OR</span>
                    <div className="flex-grow border-t border-gray-300"></div>
                </div>

                <form action={googleAuthenticate} className="w-full">
                    <button type="submit" className="w-full flex items-center justify-center gap-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-gray-700 rounded-md p-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors">
                        <svg className="h-5 w-5" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        Sign up with Google
                    </button>
                </form>

                <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                    Already have an account? <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-500">Log in</Link>
                </div>
            </div>
        </div>
    );
}

function SignupButton() {
    const { pending } = useFormStatus();

    return (
        <Button className="mt-6 w-full" aria-disabled={pending}>
            Sign up <ArrowRightIcon className="ml-auto h-5 w-5 text-gray-50" />
        </Button>
    );
}
