'use client';

import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { addMoneyByAdmin } from '@/app/lib/transaction-actions';
import { Button } from './button';
import { UserIcon, CurrencyDollarIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import { useState, useEffect } from 'react';

export default function AdminAddMoneyForm({ users }: { users: { id: string, name: string, email: string | null }[] }) {
    const [message, dispatch] = useActionState(addMoneyByAdmin, undefined);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (message === 'Money added successfully!') {
            const t = setTimeout(() => setSuccess(true), 0);
            const t2 = setTimeout(() => setSuccess(false), 3000);
            return () => { clearTimeout(t); clearTimeout(t2); };
        }
    }, [message]);

    return (
        <form action={dispatch} className="space-y-4">
            {/* User Selection */}
            <div>
                <label className="mb-2 block text-xs font-medium text-gray-900 dark:text-gray-300" htmlFor="admin-target-user">
                    Select User
                </label>
                <div className="relative">
                    <select
                        id="admin-target-user"
                        name="userId"
                        className="peer block w-full rounded-md border border-gray-200 dark:border-gray-600 py-[9px] pl-10 text-base outline-2 placeholder:text-gray-500 text-gray-900 dark:text-gray-100 dark:bg-zinc-800"
                        required
                        defaultValue=""
                    >
                        <option value="" disabled>Select a user...</option>
                        {users.map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.name} ({u.email || 'No Email'})
                            </option>
                        ))}
                    </select>
                    <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                </div>
            </div>

            {/* Amount */}
            <div>
                <label className="mb-2 block text-xs font-medium text-gray-900 dark:text-gray-300" htmlFor="admin-amount">
                    Amount
                </label>
                <div className="relative">
                    <input
                        id="admin-amount"
                        name="amount"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        className="peer block w-full rounded-md border border-gray-200 dark:border-gray-600 py-[9px] pl-10 text-base outline-2 placeholder:text-gray-500 text-gray-900 dark:text-gray-100 dark:bg-zinc-800"
                        required
                    />
                    <CurrencyDollarIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                </div>
            </div>

            {/* Payment Method */}
            <div>
                <label className="mb-2 block text-xs font-medium text-gray-900 dark:text-gray-300" htmlFor="admin-payment-method">
                    Payment Method
                </label>
                <div className="relative">
                    <select
                        id="admin-payment-method"
                        name="paymentMethod"
                        className="peer block w-full rounded-md border border-gray-200 dark:border-gray-600 py-[9px] pl-10 text-base outline-2 placeholder:text-gray-500 text-gray-900 dark:text-gray-100 dark:bg-zinc-800"
                        defaultValue="Cash"
                    >
                        <option value="Cash">Cash</option>
                        <option value="bKash">bKash</option>
                        <option value="Nagad">Nagad</option>
                        <option value="Bank">Bank</option>
                    </select>
                    <BanknotesIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                </div>
            </div>

            <SubmitButton />

            {success && <p className="text-sm text-green-600 font-medium">Added successfully!</p>}
            {message && !success && <p className="text-sm text-red-600">{message}</p>}
        </form>
    );
}

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button className="w-full justify-center bg-purple-600 hover:bg-purple-700" aria-disabled={pending}>
            {pending ? 'Processing...' : 'Add Money (Auto-Approve)'}
        </Button>
    );
}
