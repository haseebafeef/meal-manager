'use client';

import { useEffect, useState } from 'react';
import { subscribeUser, unsubscribeUser, checkSubscription } from '@/app/lib/notification-actions';

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export default function NotificationManager() {
    const [isSupported, setIsSupported] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);

    async function registerServiceWorker() {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/',
                updateViaCache: 'none',
            });

            const sub = await registration.pushManager.getSubscription();
            if (sub) {
                setIsSubscribed(true);
                // Sync with backend to ensure it's still valid
                await checkSubscription(JSON.parse(JSON.stringify(sub)).endpoint);
            }
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }

    useEffect(() => {
        async function init() {
            if ('serviceWorker' in navigator && 'PushManager' in window) {
                setIsSupported(true);
                await registerServiceWorker();
            }
        }
        init();
    }, []);

    async function subscribeToPush() {
        if (!('Notification' in window)) {
            alert('This browser does not support desktop notification');
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission === 'denied') {
            alert('Notifications are blocked. Please reset permissions in your browser settings (Lock icon in URL bar).');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(
                    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
                ),
            });

            // Serialize properly
            const subscription = JSON.parse(JSON.stringify(sub));
            await subscribeUser(subscription);
            setIsSubscribed(true);
            alert('Notifications enabled!');
        } catch (error) {
            console.error('Subscription failed:', error);
            // Check specifically for NotAllowedError to give better feedback
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((error as any).name === 'NotAllowedError') {
                alert('Notifications were blocked. Please allow them in your browser settings.');
            } else {
                alert('Failed to subscribe. Please try again.');
            }
        }
    }

    async function unsubscribeFromPush() {
        try {
            const registration = await navigator.serviceWorker.ready;
            const sub = await registration.pushManager.getSubscription();
            if (sub) {
                await sub.unsubscribe();
                await unsubscribeUser(sub.endpoint);
                setIsSubscribed(false);
                alert('Notifications disabled.');
            }
        } catch (error) {
            console.error('Unsubscription failed:', error);
        }
    }

    if (!isSupported) {
        return <div className="text-xs text-gray-500">Push notifications not supported on this device.</div>;
    }

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-2">Daily Meal Reports</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Receive a push notification daily at the cutoff time with meal summaries.
            </p>

            {isSubscribed ? (
                <button
                    onClick={unsubscribeFromPush}
                    className="px-4 py-2 bg-red-100 text-red-600 rounded-md hover:bg-red-200 text-sm font-medium transition-colors"
                >
                    Disable Notifications
                </button>
            ) : (
                <button
                    onClick={subscribeToPush}
                    className="px-4 py-2 bg-green-100 text-green-600 rounded-md hover:bg-green-200 text-sm font-medium transition-colors"
                >
                    Enable Daily Reports
                </button>
            )}
        </div>
    );
}
