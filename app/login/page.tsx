import LoginForm from '@/app/ui/login-form';
import BackgroundWrapper from '@/app/ui/background-wrapper';

export default function LoginPage() {
    return (
        <BackgroundWrapper>
            <main className="flex items-center justify-center md:h-screen pointer-events-none">
                <div className="relative mx-auto flex w-full max-w-[400px] flex-col space-y-2.5 p-4 md:-mt-32 pointer-events-auto">
                    <div className="flex h-20 w-full items-end rounded-lg bg-blue-500/80 backdrop-blur-sm p-3 md:h-36 shadow-lg border border-white/20">
                        <div className="w-32 text-white md:w-36">
                            <h1 className="text-2xl font-bold drop-shadow-md">Meal Manager</h1>
                        </div>
                    </div>
                    <LoginForm />
                </div>
            </main>
        </BackgroundWrapper>
    );
}
