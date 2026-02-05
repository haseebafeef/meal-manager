export function Skeleton({ className }: { className?: string }) {
    return (
        <div className={`animate-pulse rounded bg-gray-200 dark:bg-zinc-800 ${className}`} />
    );
}

export function CardSkeleton() {
    return (
        <div className="bg-white/80 dark:bg-black/60 backdrop-blur-md p-4 md:p-6 rounded-xl shadow-sm border border-white/20 dark:border-white/10">
            <Skeleton className="w-24 h-4 mb-2" />
            <Skeleton className="w-32 h-8" />
        </div>
    );
}

export function TableRowSkeleton() {
    return (
        <tr className="w-full border-b border-gray-100 dark:border-gray-700 last-of-type:border-none">
            <td className="relative overflow-hidden whitespace-nowrap py-3 pl-6 pr-3">
                <Skeleton className="h-6 w-24" />
            </td>
            <td className="whitespace-nowrap px-3 py-3">
                <Skeleton className="h-6 w-32" />
            </td>
            <td className="whitespace-nowrap px-3 py-3">
                <Skeleton className="h-6 w-16" />
            </td>
            <td className="whitespace-nowrap px-3 py-3">
                <Skeleton className="h-6 w-16" />
            </td>
        </tr>
    );
}

export function ExpensesSkeleton() {
    return (
        <div className="card-panel">
            <div className="flex justify-between items-center mb-4">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-5 w-24" />
            </div>
            <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-20" />
                        </div>
                    </div>
                    <Skeleton className="h-6 w-16" />
                </div>
                <div className="flex items-center justify-between border-b pb-2 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-20" />
                        </div>
                    </div>
                    <Skeleton className="h-6 w-16" />
                </div>
                <div className="flex items-center justify-between border-b pb-2 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-20" />
                        </div>
                    </div>
                    <Skeleton className="h-6 w-16" />
                </div>
            </div>
        </div>
    );
}


export function DashboardSkeleton() {
    return (
        <main className="p-4 md:p-6 pb-64">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-gray-200 dark:border-gray-800 pb-6">
                <div>
                    <Skeleton className="w-48 h-10 mb-2" />
                    <Skeleton className="w-64 h-5 mb-2" />
                    <Skeleton className="w-40 h-6" />
                </div>
                <div className="flex gap-3">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <Skeleton className="w-24 h-10 rounded-md" />
                    <Skeleton className="w-32 h-10 rounded-md" />
                    <Skeleton className="w-10 h-10 rounded-full" />
                </div>
            </div>

            {/* Meal Status */}
            <div className="mb-8 p-6 rounded-xl bg-white/80 dark:bg-black/60 border border-white/20 dark:border-white/10">
                <div className="flex justify-between mb-4">
                    <Skeleton className="w-48 h-7" />
                    <Skeleton className="w-24 h-5" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-24 rounded-lg" />
                    <Skeleton className="h-24 rounded-lg" />
                </div>
            </div>

            {/* My Summary */}
            <div className="mb-8 p-4 md:p-6 rounded-xl bg-gray-50 dark:bg-zinc-800/50 border border-blue-100">
                <Skeleton className="w-64 h-7 mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                    <CardSkeleton />
                    <CardSkeleton />
                    <CardSkeleton />
                    <CardSkeleton />
                    <CardSkeleton />
                </div>
            </div>

            {/* System Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-8">
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-5 space-y-8">
                    <div className="card-panel h-64">
                        <Skeleton className="w-48 h-7 mb-4" />
                        <Skeleton className="w-full h-10 mb-2" />
                        <Skeleton className="w-full h-10 mb-2" />
                        <Skeleton className="w-24 h-10 mt-4" />
                    </div>
                </div>
                <div className="lg:col-span-7 space-y-8">
                    <div className="card-panel h-64">
                        <Skeleton className="w-48 h-7 mb-4" />
                        <Skeleton className="w-full h-10 mb-2" />
                        <Skeleton className="w-full h-40" />
                    </div>
                    <ExpensesSkeleton />
                </div>
            </div>
        </main>
    );
}
