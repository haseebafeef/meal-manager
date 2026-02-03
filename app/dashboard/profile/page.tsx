import Link from 'next/link';
import { ThemeToggle } from '@/app/ui/theme-toggle';
import UserDropdown from '@/app/ui/user-dropdown';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import ProfileForm from '@/app/ui/profile-form';
import SecurityForm from '@/app/ui/security-form';
import ConnectedAccounts from '@/app/ui/connected-accounts';



export default async function ProfilePage() {
    const session = await auth();
    if (!session?.user) redirect('/login');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email || undefined },
        include: { accounts: true } // Fetch accounts
    });

    if (!user) {
        return <div className="p-6">Error: User not found. Please re-login.</div>;
    }

    const isGoogleConnected = user.accounts.some(a => a.provider === 'google');

    return (
        <main className="flex min-h-screen flex-col p-4 md:p-6 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 transition-colors">
            <div className="flex justify-between items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold">Edit Profile</h1>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                    <ThemeToggle />
                    <Link href="/dashboard" className="btn-secondary whitespace-nowrap">Dashboard</Link>
                    <UserDropdown user={user} />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-6">
                    <div className="rounded-xl border bg-white dark:bg-zinc-800 p-6 shadow-sm border-gray-100 dark:border-gray-700">
                        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Personal Information</h2>
                        <ProfileForm user={user} />
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="rounded-xl border bg-white dark:bg-zinc-800 p-6 shadow-sm border-gray-100 dark:border-gray-700">
                        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Connected Accounts</h2>
                        <ConnectedAccounts isGoogleConnected={isGoogleConnected} />
                    </div>

                    <div className="rounded-xl border bg-white dark:bg-zinc-800 p-6 shadow-sm border-gray-100 dark:border-gray-700">
                        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Security</h2>
                        <SecurityForm hasPassword={!!user.password} />
                    </div>
                </div>
            </div>
        </main>
    );
}
