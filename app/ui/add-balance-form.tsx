'use client';

import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { createBalanceRequest } from '@/app/lib/transaction-actions';
import { Button } from './button';
import { UserIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';

export default function AddBalanceForm({ users }: { users: { id: string, name: string }[] }) {
    const [state, dispatch] = useActionState(createBalanceRequest, { message: '' });
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (state.message === 'Request processed successfully.') {
            const t = setTimeout(() => setSuccess(true), 0);
            return () => clearTimeout(t);
        } // Simple check, ideally state would be more structured
    }, [state.message]);

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
        <form action={dispatch} className="space-y-3">
            <div className="rounded-lg bg-gray-50 dark:bg-zinc-800 px-6 pb-4 pt-8 border border-gray-100 dark:border-gray-700">
                {/* Amount */}
                <div>
                    <label className="mb-3 block text-xs font-medium text-gray-900 dark:text-gray-300" htmlFor="amount">Amount</label>
                    <div className="relative">
                        <input
                            className="peer block w-full rounded-md border border-gray-200 dark:border-gray-600 py-[9px] pl-10 text-base outline-2 placeholder:text-gray-500 text-gray-900 dark:text-gray-100 dark:bg-zinc-800"
                            id="amount"
                            type="number"
                            step="0.01"
                            name="amount"
                            placeholder="0.00"
                            required
                        />
                        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 peer-focus:text-gray-900 dark:text-gray-400 dark:peer-focus:text-gray-100 font-bold">৳</div>
                    </div>
                </div>

                {/* Payment Method */}
                <div>
                    <label className="mb-3 block text-xs font-medium text-gray-900 dark:text-gray-300" htmlFor="paymentMethod">Money Sent Through</label>
                    <div className="relative">
                        <select
                            className="peer block w-full rounded-md border border-gray-200 dark:border-gray-600 py-[9px] px-3 text-base outline-2 placeholder:text-gray-500 text-gray-900 dark:text-gray-100 dark:bg-zinc-800 appearance-none"
                            id="paymentMethod"
                            name="paymentMethod"
                            defaultValue=""
                            required
                        >
                            <option value="" disabled>Select Method</option>
                            <option value="Cash">Cash</option>
                            <option value="bKash">bKash</option>
                            <option value="Nagad">Nagad</option>
                            <option value="Bank">Bank</option>
                        </select>
                    </div>
                </div>

                {/* Receiver */}
                <div className="mt-4">
                    <label className="mb-3 block text-xs font-medium text-gray-900 dark:text-gray-300" htmlFor="receiverId">Sent To</label>
                    <div className="relative">
                        <select
                            className="peer block w-full rounded-md border border-gray-200 dark:border-gray-600 py-[9px] pl-10 text-base outline-2 placeholder:text-gray-500 text-gray-900 dark:text-gray-100 dark:bg-zinc-800"
                            id="receiverId"
                            name="receiverId"
                            defaultValue=""
                            required
                        >
                            <option value="" disabled>Select a user</option>
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>{user.name}</option>
                            ))}
                        </select>
                        <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900 dark:text-gray-400 dark:peer-focus:text-gray-100" />
                    </div>
                </div>

                <SubmitButton />

                <div className="flex h-8 items-end space-x-1" aria-live="polite" aria-atomic="true">
                    {state.message && state.message !== 'Request processed successfully.' && (
                        <>
                            <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
                            <p className="text-sm text-red-500">{state.message}</p>
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
