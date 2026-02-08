import { Skeleton, TableRowSkeleton, CardSkeleton } from '@/app/ui/skeletons';

export default function Loading() {
    return (
        <main className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-4 md:p-6">
            <div className="flex justify-between items-center mb-6">
                <Skeleton className="h-8 w-64" />
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

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-6 mb-8">
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
            </div>

            {/* Transactions Table */}
            <div className="rounded-xl border bg-white dark:bg-zinc-800 p-6 shadow-sm border-gray-100 dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="border-b-2 border-gray-200 dark:border-gray-700">
                            <tr>
                                <th className="px-4 py-3"><Skeleton className="h-4 w-16" /></th>
                                <th className="px-4 py-3"><Skeleton className="h-4 w-32" /></th>
                                <th className="px-4 py-3"><Skeleton className="h-4 w-16" /></th>
                                <th className="px-4 py-3"><Skeleton className="h-4 w-24" /></th>
                                <th className="px-4 py-3"><Skeleton className="h-4 w-16" /></th>
                                <th className="px-4 py-3"><Skeleton className="h-4 w-16" /></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                                <TableRowSkeleton key={i} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}
