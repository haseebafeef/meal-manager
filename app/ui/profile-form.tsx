'use client';

import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { updateProfile } from '@/app/lib/profile-actions';
import { Button } from './button';
import { UserIcon, AtSymbolIcon, DevicePhoneMobileIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { useState, useEffect } from 'react';

import { User } from '@prisma/client';
import Image from 'next/image';

export default function ProfileForm({ user }: { user: User }) {
    const [state, dispatch] = useActionState(updateProfile, { message: '' });
    const [success, setSuccess] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (state.message === 'Profile Updated Successfully!') {
            // Use logical update to avoid immediate set if already true, 
            // though standard set is fine. The warning "Calling setState synchronously"
            // usually implies it happens during render, but this is useEffect.
            // However, strictly, let's wrap in transition or timeout to be safe if that was the issue,
            // or simply ensure dependencies are correct. 
            // The linter might be flagging that we react to state.message immediately.
            const t = setTimeout(() => {
                setSuccess(true);
            }, 0);
            const t2 = setTimeout(() => setSuccess(false), 3000);
            return () => { clearTimeout(t); clearTimeout(t2); };
        }
    }, [state.message]);

    // Handle Image Selection & Preview
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Size Validation (Limit to 5MB)
        if (file.size > 5 * 1024 * 1024) {
            setError("Image size too large. Please choose an image under 5MB.");
            return;
        }
        setError(null);

        // Create Preview
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);

        // Determine if we should auto-submit or just let them click 'Save'
        // The prompt says "passed in uploading image -> load/show imediatly -> then save"
        // So explicit save is likely expected or acceptable.
    };

    // Cleanup object URL
    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    return (
        <form action={dispatch} className="space-y-4" encType="multipart/form-data">
            <div className="flex flex-col items-center mb-6">
                <div className="relative w-24 h-24 mb-4">
                    {previewUrl || user.image ? (
                        <Image
                            src={previewUrl || user.image!} // We check user.image above
                            alt="Profile"
                            width={96}
                            height={96}
                            className="rounded-full object-cover border-4 border-white shadow-md w-full h-full"
                        />
                    ) : (
                        <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
                            <UserIcon className="w-12 h-12" />
                        </div>
                    )}
                    <label
                        htmlFor="image-upload"
                        className="absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full cursor-pointer shadow-sm transition-colors"
                    >
                        <ArrowUpTrayIcon className="w-4 h-4" />
                    </label>
                    <input
                        id="image-upload"
                        type="file"
                        name="image"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageChange}
                    />
                </div>
                <p className="text-xs text-gray-500">Tap icon to change photo</p>
                {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>

            <div>
                <label className="mb-2 block text-xs font-medium text-gray-900 dark:text-gray-100" htmlFor="name">Name</label>
                <div className="relative">
                    <input
                        className="peer block w-full rounded-md border border-gray-200 dark:border-gray-700 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500 text-gray-900 dark:bg-zinc-900 dark:text-gray-100"
                        id="name"
                        type="text"
                        name="name"
                        defaultValue={user.name || ''}
                        required
                    />
                    <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900 dark:peer-focus:text-gray-100" />
                </div>
            </div>

            <div>
                <label className="mb-2 block text-xs font-medium text-gray-900 dark:text-gray-100" htmlFor="nickname">Nickname (Display Name)</label>
                <div className="relative">
                    <input
                        className="peer block w-full rounded-md border border-gray-200 dark:border-gray-700 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500 text-gray-900 dark:bg-zinc-900 dark:text-gray-100"
                        id="nickname"
                        type="text"
                        name="nickname"
                        defaultValue={user.nickname || user.name}
                        placeholder="e.g. Johnny"
                    />
                    <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900 dark:peer-focus:text-gray-100" />
                </div>
                <p className="text-[10px] text-gray-500 mt-1">This name will be used in Meal Lists.</p>
            </div>

            <div>
                <label className="mb-2 block text-xs font-medium text-gray-900 dark:text-gray-100" htmlFor="email">Email</label>
                <div className="relative">
                    <input
                        className="peer block w-full rounded-md border border-gray-200 dark:border-gray-700 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500 text-gray-900 dark:bg-zinc-900 dark:text-gray-100"
                        id="email"
                        type="email"
                        name="email"
                        defaultValue={user.email || ''}
                    />
                    <AtSymbolIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900 dark:peer-focus:text-gray-100" />
                </div>
            </div>

            <div>
                <label className="mb-2 block text-xs font-medium text-gray-900 dark:text-gray-100" htmlFor="phone">Phone</label>
                <div className="relative">
                    <input
                        className="peer block w-full rounded-md border border-gray-200 dark:border-gray-700 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500 text-gray-900 dark:bg-zinc-900 dark:text-gray-100"
                        id="phone"
                        type="tel"
                        name="phone"
                        defaultValue={user.phone || ''}
                        required
                    />
                    <DevicePhoneMobileIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900 dark:peer-focus:text-gray-100" />
                </div>
            </div>

            <SubmitButton label="Update Profile" />

            {success && <p className="text-green-600 text-sm">Saved!</p>}
            {state.message && !success && <p className="text-red-600 text-sm">{state.message}</p>}
        </form>
    );
}

function SubmitButton({ label }: { label: string }) {
    const { pending } = useFormStatus();
    return (
        <Button className="mt-4 w-full justify-center" aria-disabled={pending}>
            {pending ? 'Saving...' : label}
        </Button>
    );
}
