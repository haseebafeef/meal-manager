import { auth } from '@/auth';
import { PrismaClient } from '@prisma/client';
import { redirect } from 'next/navigation';
import { approveRequest, declineRequest } from '@/app/lib/transaction-actions';

import { ThemeToggle } from '@/app/ui/theme-toggle';
import UserDropdown from '@/app/ui/user-dropdown';
import Link from 'next/link';

const prisma = new PrismaClient();

export default async function RequestsPage() {
    const session = await auth();
    if (!session?.user?.email) redirect('/login');

    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser) redirect('/login');

    // Fetch incoming PENDING requests
    const incomingRequests = await prisma.transaction.findMany({
        where: {
            approverId: currentUser.id,
            status: 'PENDING'
        },
        include: { requester: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }
    });



    // ...

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 p-4 md:p-6 transition-colors duration-300">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Incoming Requests</h1>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <Link href="/dashboard" className="btn-secondary">Back to Dashboard</Link>
                    <UserDropdown user={currentUser} />
                </div>
            </div>

            <div className="card-panel">
                {incomingRequests.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400">No pending requests.</p>
                ) : (
                    <div className="flow-root">
                        <ul role="list" className="divide-y divide-gray-200 dark:divide-gray-700">
                            {incomingRequests.map((req) => (
                                <li key={req.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <p className="font-semibold text-lg">{req.requester.name}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            Requested <span className="font-bold text-gray-900 dark:text-white">৳{req.amount.toFixed(2)}</span>
                                        </p>
                                        <p className="text-xs text-gray-400">{req.createdAt.toLocaleDateString()}</p>
                                    </div>
                                    <div className="flex gap-3">
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        <form action={approveRequest as any}>
                                            <input type="hidden" name="id" value={req.id} />
                                            <button className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg shadow-sm">
                                                Accept
                                            </button>
                                        </form>
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        <form action={declineRequest as any}>
                                            <input type="hidden" name="id" value={req.id} />
                                            <button className="px-4 py-2 bg-white dark:bg-zinc-800 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium rounded-lg shadow-sm">
                                                Decline
                                            </button>
                                        </form>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </main>
    );
}
