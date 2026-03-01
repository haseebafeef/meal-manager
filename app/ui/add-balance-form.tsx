'use client';

import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { createBalanceRequest } from '@/app/lib/transaction-actions';
import { Button } from './button';
import { UserIcon, CheckCircleIcon, ExclamationCircleIcon, CreditCardIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';

export default function AddBalanceForm({ users }: { users: { id: string, name: string }[] }) {
    const [state, dispatch] = useActionState(createBalanceRequest, { success: '', error: '' });
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (state.success === 'Request processed successfully.') {
            const t = setTimeout(() => setSuccess(true), 0);
            return () => clearTimeout(t);
        }
    }, [state.success]);

    if (success) {
        return (
            <div className="rounded-md bg-green-50 p-4">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <CheckCircleIcon className="h-5 w-5 text-green-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                        <p className="text-sm font-medium text-green-800">Request sent successfully!</p>
                    </div>
                </div>
                <button onClick={() => setSuccess(false)} className="mt-4 text-sm text-green-600 underline">Send another</button>
            </div>
        )
    }

    return (
        <form action={dispatch} className="space-y-2">
            <div className="rounded-lg bg-gray-50/50 dark:bg-zinc-800/40 p-2.5 md:p-3.5 border border-gray-100 dark:border-gray-700/30">
                <div className="space-y-2 md:space-y-3">
                    {/* Amount */}
                    <div>
                        <label className="label-compact block mb-1" htmlFor="amount">Amount</label>
                        <div className="relative">
                            <input
                                className="peer input-compact pl-10"
                                id="amount"
                                type="number"
                                step="0.01"
                                name="amount"
                                placeholder="0.00"
                                required
                            />
                            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 peer-focus:text-gray-900 dark:text-gray-500 dark:peer-focus:text-gray-100 font-bold text-sm">৳</div>
                        </div>
                    </div>

                    {/* Sent Through Selection */}
                    <div>
                        <label className="label-compact block mb-1" htmlFor="paymentMethod">Money Sent Through</label>
                        <div className="relative">
                            <select
                                id="paymentMethod"
                                name="paymentMethod"
                                className="peer input-compact pl-10"
                                required
                                defaultValue=""
                            >
                                <option value="" disabled>Select Method</option>
                                <option value="Cash">Cash</option>
                                <option value="bKash">bKash</option>
                                <option value="Nagad">Nagad</option>
                                <option value="Bank">Bank</option>
                            </select>
                            <CreditCardIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 peer-focus:text-gray-900 dark:text-gray-500 dark:peer-focus:text-gray-100" />
                        </div>
                    </div>

                    {/* Target User Selection (Receiver) */}
                    <div>
                        <label className="label-compact block mb-1" htmlFor="receiverId">Sent To</label>
                        <div className="relative">
                            <select
                                id="receiverId"
                                name="receiverId"
                                className="peer input-compact pl-10"
                                required
                                defaultValue=""
                            >
                                <option value="" disabled>Select a user</option>
                                {users.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.name}
                                    </option>
                                ))}
                            </select>
                            <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 peer-focus:text-gray-900 dark:text-gray-500 dark:peer-focus:text-gray-100" />
                        </div>
                    </div>

                    {/* Note */}
                    <div>
                        <label className="label-compact block mb-1" htmlFor="note">Note (Optional)</label>
                        <div className="relative">
                            <input
                                className="peer input-compact px-2.5"
                                id="note"
                                name="note"
                                placeholder="Add a note..."
                            />
                        </div>
                    </div>
                </div>

                <SubmitButton />

                <div className="flex h-8 items-end space-x-1" aria-live="polite" aria-atomic="true">
                    {state.error && (
                        <>
                            <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
                            <p className="text-sm text-red-500">{state.error}</p>
                        </>
                    )}
                </div>
            </div>
        </form >
    );
}

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button className="mt-4 w-full justify-center" aria-disabled={pending}>
            {pending ? 'Sending...' : 'Send'}
        </Button>
    );
}
