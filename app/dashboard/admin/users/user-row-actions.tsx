'use client';

import { toggleAdminStatus, toggleUserStatus } from '@/app/lib/admin-actions';

import { useState } from 'react';
import Link from 'next/link';

interface User {
    id: string;
    isAdmin: boolean;
    status: string; // "Active" | "Inactive"
}

export default function UserRowActions({ user, isSelf }: { user: User, isSelf: boolean }) {
    const [loading, setLoading] = useState(false);
    const isInactive = user.status === 'Inactive';

    const handleInactiveClick = (e: React.MouseEvent, action: string) => {
        if (isInactive) {
            e.preventDefault();
            alert(`User is inactive. Cannot ${action}.`);
        }
    };

    const handleToggleStatus = async () => {
        if (loading) return;
        if (isSelf) {
            alert("You cannot deactivate yourself.");
            return;
        }

        const confirmMsg = isInactive
            ? "Activate this user? They will regain access."
            : "Deactivate this user? They will lose access to actions.";

        if (!confirm(confirmMsg)) return;

        setLoading(true);
        await toggleUserStatus(user.id, user.status);
        setLoading(false);
    };

    const handleToggleAdmin = async () => {
        if (isInactive) {
            alert("User is inactive. Cannot change admin rights.");
            return;
        }
        if (isSelf) return; // Should be disabled/handled by UI, but safety check

        setLoading(true);
        await toggleAdminStatus(user.id, user.isAdmin);
        setLoading(false);
    };

    return (
        <div className="flex items-center justify-end gap-2">
            {/* Manage Meals */}
            <Link
                href={`/dashboard/admin/meals/${user.id}`}
                onClick={(e) => handleInactiveClick(e, "manage meals")}
                className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${isInactive
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600 dark:border-zinc-700'
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/50'
                    }`}
            >
                Manage Meals
            </Link>

            {/* Toggle Status (Active/Inactive) */}
            <button
                onClick={handleToggleStatus}
                disabled={loading || isSelf}
                className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${isSelf
                    ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500 border-gray-200 dark:bg-zinc-800 dark:text-zinc-500'
                    : isInactive
                        ? 'bg-gray-600 text-white hover:bg-gray-700 border-gray-600 dark:bg-zinc-700 dark:hover:bg-zinc-600'
                        : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-300 dark:bg-zinc-800 dark:text-gray-300 dark:border-zinc-600 dark:hover:bg-zinc-700'
                    }`}
                title={isSelf ? "Cannot deactivate yourself" : (isInactive ? "Click to Activate" : "Click to Deactivate")}
            >
                {loading ? '...' : (isInactive ? 'Inactive' : 'Active')}
            </button>

            {/* Toggle Admin */}
            <button
                onClick={handleToggleAdmin}
                disabled={loading || (isSelf && !isInactive)}
                /* Note: isSelf is handled below for tooltip, but button logic here */
                className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${isSelf
                    ? 'opacity-50 cursor-not-allowed ' + (user.isAdmin
                        ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400'
                        : 'bg-green-50 text-green-600 border-green-200')
                    : isInactive
                        ? 'opacity-50 cursor-not-allowed ' + (user.isAdmin
                            ? 'bg-red-50 text-red-400 border-red-100 dark:bg-red-900/10 dark:text-red-500'
                            : 'bg-green-50 text-green-400 border-green-100 dark:bg-green-900/10 dark:text-green-500')
                        : user.isAdmin
                            ? 'bg-red-50 text-red-600 hover:bg-red-100 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50'
                            : 'bg-green-50 text-green-600 hover:bg-green-100 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/50'
                    }`}
                title={isSelf ? "You cannot revoke your own admin rights" : (isInactive ? "User is inactive" : "")}
            >
                {user.isAdmin ? 'Revoke Admin' : 'Make Admin'}
            </button>
        </div>
    );
}
