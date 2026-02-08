export function Footer() {
    return (
        <footer className="py-4 text-center text-[10px] text-gray-600 dark:text-gray-300 mt-auto pointer-events-none">
            <p className="flex items-center justify-center gap-1 bg-white/40 dark:bg-black/40 backdrop-blur-md py-0.5 px-2 rounded-full inline-block mx-auto border border-white/20 dark:border-white/10 shadow-sm pointer-events-auto">
                Designed & Developed with <span className="text-red-500 animate-pulse">❤</span> by <a href="https://github.com/haseebafeef/" target="_blank" className="font-bold hover:text-blue-600 dark:hover:text-blue-400 underline decoration-dotted underline-offset-2">Haseeb</a>
            </p>
        </footer>
    );
}
