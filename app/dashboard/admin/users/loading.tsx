import { Skeleton, TableRowSkeleton } from '@/app/ui/skeletons';

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

            <div className="card-panel overflow-hidden bg-white dark:bg-zinc-800 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm whitespace-nowrap">
                        <thead className="uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 font-medium">
                            <tr>
                                <th scope="col" className="px-4 py-3"><Skeleton className="h-4 w-12" /></th>
                                <th scope="col" className="px-4 py-3"><Skeleton className="h-4 w-12" /></th>
                                <th scope="col" className="px-4 py-3"><Skeleton className="h-4 w-16" /></th>
                                <th scope="col" className="px-4 py-3"><Skeleton className="h-4 w-12" /></th>
                                <th scope="col" className="px-4 py-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            <TableRowSkeleton />
                            <TableRowSkeleton />
                            <TableRowSkeleton />
                            <TableRowSkeleton />
                            <TableRowSkeleton />
                            <TableRowSkeleton />
                            <TableRowSkeleton />
                            <TableRowSkeleton />
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}
