'use client';

import { useState } from 'react';
import { updateUserTag } from '@/app/lib/user-tag-actions';
import { PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function UserTagEditor({ userId, initialTag }: { userId: string, initialTag: string | null | undefined }) {
    const [isEditing, setIsEditing] = useState(false);
    const [tag, setTag] = useState(initialTag || '');
    const [isLoading, setIsLoading] = useState(false);

    const handleSave = async () => {
        if (tag === initialTag) {
            setIsEditing(false);
            return;
        }
        setIsLoading(true);
        try {
            await updateUserTag(userId, tag);
            setIsEditing(false);
        } catch (error) {
            console.error('Failed to update tag:', error);
            alert('Failed to update tag');
        } finally {
            setIsLoading(false);
        }
    };

    if (isEditing) {
        return (
            <div className="flex items-center gap-1">
                <input
                    type="text"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    className="w-16 px-2 py-1 text-xs border rounded dark:bg-zinc-800 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                />
                <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="p-1 hover:bg-green-100 dark:hover:bg-green-900 rounded-full text-green-600"
                >
                    <CheckIcon className="w-3 h-3" />
                </button>
                <button
                    onClick={() => { setTag(initialTag || ''); setIsEditing(false); }}
                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded-full text-red-600"
                >
                    <XMarkIcon className="w-3 h-3" />
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditing(true)}>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                {tag}
            </span>
            <PencilIcon className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
    );
}
