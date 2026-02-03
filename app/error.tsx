'use client';

import { useEffect } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error(error);
    }, [error]);

    return (
        <main className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 p-4 text-center">
            <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-4">
                <ExclamationTriangleIcon className="w-10 h-10 text-red-600 dark:text-red-500" />
            </div>
            <h2 className="text-xl font-semibold">Something went wrong!</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-md">
                We encountered an unexpected error. Please try again or contact support if the issue persists.
            </p>
            <div className="flex gap-3 mt-2">
                <button
                    onClick={reset}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                >
                    Try again
                </button>
                <button
                    onClick={() => window.location.href = '/dashboard'}
                    className="rounded-md bg-gray-200 dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-300 dark:hover:bg-zinc-700"
                >
                    Go Dashboard
                </button>
            </div>
        </main>
    );
}
