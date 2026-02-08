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

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-gray-700 flex flex-col gap-3">
                        <Skeleton className="w-12 h-12 rounded-lg" />
                        <div>
                            <Skeleton className="h-6 w-32 mb-2" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4 mt-1" />
                        </div>
                    </div>
                ))}
            </div>
        </main>
    );
}
