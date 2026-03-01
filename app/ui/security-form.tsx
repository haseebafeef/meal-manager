'use client';

import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { updatePassword } from '@/app/lib/profile-actions';
import { Button } from './button';
import { KeyIcon } from '@heroicons/react/24/outline';
import { useState, useEffect } from 'react';

export default function SecurityForm({ hasPassword }: { hasPassword: boolean }) {
    const [state, dispatch] = useActionState(updatePassword, { success: '', error: '' });
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (state.success === 'Password Updated Successfully!' || state.success === 'Password Set Successfully!') {
            const t = setTimeout(() => setSuccess(true), 0);
            const t2 = setTimeout(() => setSuccess(false), 3000);
            return () => { clearTimeout(t); clearTimeout(t2); };
        }
    }, [state.success]);

    return (
        <form action={dispatch} className="space-y-4">
            {!hasPassword && (
                <p className="text-sm text-gray-500 mb-4 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800 text-blue-700 dark:text-blue-300">
                    Set a password for your account to log in using email or phone number.
                </p>
            )}

            {hasPassword && (
                <div>
                    <label className="mb-2 block text-xs font-medium text-gray-900 dark:text-gray-100" htmlFor="currentPassword">Current Password</label>
                    <div className="relative">
                        <input
                            className="peer block w-full rounded-md border border-gray-200 dark:border-gray-700 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500 text-gray-900 dark:bg-zinc-900 dark:text-gray-100"
                            id="currentPassword"
                            type="password"
                            name="currentPassword"
                            required
                        />
                        <KeyIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900 dark:peer-focus:text-gray-100" />
                    </div>
                </div>
            )}

            <div>
                <label className="mb-2 block text-xs font-medium text-gray-900 dark:text-gray-100" htmlFor="newPassword">New Password</label>
                <div className="relative">
                    <input
                        className="peer block w-full rounded-md border border-gray-200 dark:border-gray-700 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500 text-gray-900 dark:bg-zinc-900 dark:text-gray-100"
                        id="newPassword"
                        type="password"
                        name="newPassword"
                        required
                        minLength={6}
                    />
                    <KeyIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900 dark:peer-focus:text-gray-100" />
                </div>
            </div>

            <SubmitButton label={hasPassword ? "Update Password" : "Set Password"} />

            {success && <p className="text-green-600 text-sm">Saved!</p>}
            {state.error && !success && <p className="text-red-600 text-sm">{state.error}</p>}
        </form>
    );
}

function SubmitButton({ label }: { label: string }) {
    const { pending } = useFormStatus();
    return (
        <Button className="mt-4 w-full justify-center bg-gray-800 hover:bg-gray-700 text-white dark:bg-blue-600 dark:hover:bg-blue-500" aria-disabled={pending}>
            {pending ? 'Saving...' : label}
        </Button>
    );
}
