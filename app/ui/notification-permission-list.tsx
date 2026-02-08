'use client';

import { toggleNotificationPermission } from '@/app/lib/notification-admin-actions';
import { useTransition } from 'react';
import Image from 'next/image';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function NotificationPermissionList({ users }: { users: any[] }) {
    const [isPending, startTransition] = useTransition();
    // Optimistic UI could be added here, but simple state is fine for now

    const handleToggle = (userId: string, currentStatus: boolean) => {
        startTransition(async () => {
            await toggleNotificationPermission(userId, !currentStatus);
        });
    };

    return (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {users.map((user) => {
                const hasDeviceRegistered = user.pushSubscriptions && user.pushSubscriptions.length > 0;

                return (
                    <div key={user.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors">
                        <div className="flex items-center gap-3">
                            {user.image ? (
                                <Image src={user.image} alt={user.name} width={40} height={40} className="rounded-full object-cover" />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                                    {user.name[0]}
                                </div>
                            )}
                            <div>
                                <h3 className="font-medium text-sm">{user.name}</h3>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span>{user.email}</span>
                                    {hasDeviceRegistered && (
                                        <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full text-[10px] font-medium border border-green-200">
                                            Device Ready
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={user.receiveDailyReports}
                                onChange={() => handleToggle(user.id, user.receiveDailyReports)}
                                disabled={isPending}
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                        </label>
                    </div>
                );
            })}

            {users.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                    No users found.
                </div>
            )}
        </div>
    );
}
