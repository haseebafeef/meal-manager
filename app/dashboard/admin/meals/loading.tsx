import { Skeleton } from '@/app/ui/skeletons';

export default function Loading() {
    return (
        <main className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-4 md:p-6">
            <div className="flex justify-between items-center mb-6">
                <Skeleton className="h-8 w-64" /> {/* Title with Name */}
                <div className="flex items-center gap-2">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-10 w-32 rounded-md" />
                    <Skeleton className="h-10 w-10 rounded-full" />
                </div>
            </div>

            {/* Month Navigation */}
            <div className="flex justify-between items-center bg-white dark:bg-zinc-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 max-w-sm mx-auto">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-8 w-8 rounded-full" />
            </div>

            {/* Calendar Grid Skeleton */}
            <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
                    {[...Array(7)].map((_, i) => (
                        <div key={i} className="py-3 text-center border-r border-gray-100 dark:border-gray-800 last:border-0">
                            <Skeleton className="h-4 w-8 mx-auto" />
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 auto-rows-fr">
                    {[...Array(35)].map((_, i) => (
                        <div key={i} className="min-h-[100px] p-2 border-b border-r border-gray-100 dark:border-gray-800 relative">
                            <Skeleton className="h-4 w-6 mb-2" />
                            <div className="space-y-1">
                                <Skeleton className="h-5 w-full rounded-md opacity-50" />
                                <Skeleton className="h-5 w-full rounded-md opacity-50" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}
