import { Skeleton } from '@/app/ui/skeletons';

export default function Loading() {
    return (
        <main className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-4 md:p-6">
            <div className="flex justify-between items-center mb-6">
                <Skeleton className="h-8 w-48" />
                <div className="flex items-center gap-2">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-10 w-32 rounded-md" />
                    <Skeleton className="h-10 w-10 rounded-full" />
                </div>
            </div>

            <div className="max-w-4xl space-y-6">
                {/* Settings Form Skeleton */}
                <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                    <Skeleton className="h-6 w-32 mb-6" />

                    <div className="space-y-6">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-50 dark:border-gray-800 pb-4 last:border-0 last:pb-0">
                                <div>
                                    <Skeleton className="h-5 w-40 mb-2" />
                                    <Skeleton className="h-3 w-64" />
                                </div>
                                <Skeleton className="h-10 w-full md:w-32 rounded-md" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}
