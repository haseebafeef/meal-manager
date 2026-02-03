'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { UserIcon, ArrowRightOnRectangleIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { signOutAction } from '@/app/lib/auth-actions';
import Link from 'next/link';

interface UserDropdownProps {
    user: {
        name: string | null;
        image: string | null;
        email: string | null;
        isAdmin?: boolean;
    };
}

export default function UserDropdown({ user }: UserDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [imageError, setImageError] = useState(false);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 focus:outline-none"
            >
                {user.image && !imageError ? (
                    <Image
                        src={user.image}
                        alt="Profile"
                        width={40}
                        height={40}
                        className="rounded-full object-cover border-2 border-gray-200 dark:border-gray-700 w-10 h-10"
                        onError={() => setImageError(true)}
                    />
                ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 border-2 border-transparent dark:border-blue-800">
                        <span className="text-lg font-bold">
                            {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                        </span>
                    </div>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-gray-100 dark:border-gray-700 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                    </div>

                    {user.isAdmin && (
                        <Link
                            href="/dashboard/admin"
                            className="flex items-center px-4 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-zinc-700 w-full text-left"
                            onClick={() => setIsOpen(false)}
                        >
                            <UserIcon className="w-4 h-4 mr-2" />
                            Admin Management
                        </Link>
                    )}

                    <a
                        href="/dashboard/profile"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700"
                        role="menuitem"
                        onClick={() => setIsOpen(false)}
                    >
                        <UserCircleIcon className="w-4 h-4 mr-2" />
                        Your Profile
                    </a>


                    <form action={signOutAction}>
                        <button
                            type="submit"
                            className="flex items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-zinc-700 w-full text-left"
                        >
                            <ArrowRightOnRectangleIcon className="w-4 h-4 mr-2" />
                            Sign Out
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
