import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import BackgroundWrapper from "@/app/ui/background-wrapper";
import { Footer } from "@/app/ui/footer";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <BackgroundWrapper>
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-white text-shadow-sm pointer-events-none">
        <div className="flex max-w-2xl flex-col items-center text-center backdrop-blur-sm bg-black/20 p-8 rounded-2xl border border-white/10 pointer-events-auto">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl mb-6 drop-shadow-lg">
            Hostel Meal Manager
          </h1>
          <p className="mb-10 text-lg sm:text-xl text-white/90 max-w-lg drop-shadow-md">
            Effortlessly manage daily meals, track expenses, and handle balance requests with ease.
          </p>
          <div className="flex flex-col space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0">
            <Link
              href="/login"
              className="flex items-center justify-center rounded-lg bg-white/90 px-8 py-3 text-base font-semibold text-blue-900 shadow-lg transition-all hover:bg-white hover:scale-105"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="flex items-center justify-center rounded-lg border border-white/40 bg-black/30 px-8 py-3 text-base font-semibold text-white transition-all hover:bg-black/50 hover:border-white/60"
            >
              Create Account <ArrowRightIcon className="ml-2 h-5 w-5" />
            </Link>
          </div>
        </div>

        <div className="mt-16 text-sm text-white/70">
          © 2026 Meal Manager App. All rights reserved.
        </div>
        <Footer />
      </main>
    </BackgroundWrapper>
  );
}
