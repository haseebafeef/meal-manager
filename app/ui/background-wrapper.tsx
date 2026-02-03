import Image from 'next/image';
import { fetchRandomBackgroundAction } from "@/app/lib/wikimedia";

export default async function BackgroundWrapper({ children }: { children: React.ReactNode }) {
    // Fetch background on the server
    const bg = await fetchRandomBackgroundAction();

    return (
        <div className="relative min-h-screen w-full transition-colors duration-500">
            {/* Background Image Layer */}
            {bg && (
                <div className="fixed inset-0 z-0 fade-in duration-1000">
                    {/* Image */}
                    <Image
                        src={bg.url}
                        alt={bg.title}
                        fill
                        className="object-cover"
                        quality={75}
                        priority
                    />
                    {/* Overlay for Contrast - Gradient for better text readability */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-white/40 to-white/60 dark:from-black/70 dark:via-black/50 dark:to-black/70 backdrop-blur-[3px]" />
                </div>
            )}

            {/* Content Layer */}
            <div className="relative z-10 min-h-screen flex flex-col">
                {children}

                <footer className="py-6 text-center text-sm text-gray-600 dark:text-gray-300 mt-auto">
                    <p className="flex items-center justify-center gap-1 bg-white/40 dark:bg-black/40 backdrop-blur-md py-1 px-3 rounded-full inline-block mx-auto border border-white/20 dark:border-white/10 shadow-sm">
                        Designed & Developed with <span className="text-red-500 animate-pulse">❤</span> by <a href="https://github.com/haseebafeef/" target="_blank" className="font-bold hover:text-blue-600 dark:hover:text-blue-400 underline decoration-dotted underline-offset-2">Haseeb</a>
                    </p>
                </footer>
            </div>

            {/* Attribution Footer (floating) */}
            {bg && (
                <div className="fixed bottom-3 right-4 z-0 max-w-md text-right pointer-events-none">
                    <div className="inline-block bg-black/60 backdrop-blur-md text-white px-4 py-2 rounded-lg text-xs border border-white/10 shadow-lg pointer-events-auto transition-opacity hover:opacity-100 opacity-80">
                        <div className="mb-0.5">
                            <a
                                href={bg.attributionUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-bold hover:underline text-shadow-sm"
                            >
                                {bg.title.substring(0, 60)}{bg.title.length > 60 ? '...' : ''}
                            </a>
                        </div>
                        <div className="text-[10px] text-gray-300">
                            By {bg.artistUrl ? (
                                <a
                                    href={bg.artistUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium text-gray-200 hover:underline"
                                >
                                    {bg.artist}
                                </a>
                            ) : (
                                <span className="font-medium text-gray-200">{bg.artist}</span>
                            )} • <a
                                href={bg.licenseUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline text-gray-200"
                            >
                                {bg.license}
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
