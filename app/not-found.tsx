import Link from 'next/link';
import { HomeIcon } from '@heroicons/react/24/outline';

export default function NotFound() {
    return (
        <main className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100">
            <div className="rounded-full bg-gray-100 dark:bg-zinc-800 p-4">
                <span className="text-4xl">🍽️</span>
            </div>
            <h2 className="text-xl font-semibold">404 - Page Not Found</h2>
            <p className="text-gray-500 dark:text-gray-400">Could not find the requested meal or resource.</p>
            <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
                <HomeIcon className="w-4 h-4" />
                Return to Dashboard
            </Link>
        </main>
    );
}
