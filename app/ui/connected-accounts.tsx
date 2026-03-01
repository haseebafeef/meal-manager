'use client';

import { useTransition } from 'react';
import { unlinkGoogleAccount } from '@/app/lib/profile-actions';
import { googleAuthenticate } from '@/app/lib/actions';
import { Button } from './button';


export default function ConnectedAccounts({ isGoogleConnected }: { isGoogleConnected: boolean }) {
    const [isPending, startTransition] = useTransition();

    const handleUnlink = () => {
        if (!confirm('Are you sure you want to unlink your Google Account?')) return;

        startTransition(async () => {
            const res = await unlinkGoogleAccount();
            if (res?.error) {
                alert(res.error);
            }
            if (res?.success) {
                alert(res.success);
            }
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-white rounded-full flex items-center justify-center border shadow-sm">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                            <path
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                fill="#4285F4"
                            />
                            <path
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                fill="#34A853"
                            />
                            <path
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                fill="#FBBC05"
                            />
                            <path
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                fill="#EA4335"
                            />
                        </svg>
                    </div>
                    <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">Google Account</p>
                        <p className={`text-xs ${isGoogleConnected ? 'text-green-600' : 'text-gray-500'}`}>
                            {isGoogleConnected ? 'Connected' : 'Not connected'}
                        </p>
                    </div>
                </div>
                <div>
                    {isGoogleConnected ? (
                        <Button
                            className="bg-white border text-red-600 hover:bg-red-50 border-red-200 dark:bg-transparent dark:border-red-900 dark:text-red-400"
                            onClick={handleUnlink}
                            disabled={isPending}
                        >
                            {isPending ? 'Unlinking...' : 'Unlink'}
                        </Button>
                    ) : (
                        <form action={googleAuthenticate}>
                            <Button
                                className="bg-white border text-blue-600 hover:bg-blue-50 border-blue-200 dark:bg-transparent dark:border-blue-900 dark:text-blue-400"
                            >
                                Connect
                            </Button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
