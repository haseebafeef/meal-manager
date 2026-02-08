import { Footer } from "@/app/ui/footer";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="relative min-h-screen flex flex-col">
            {children}
            <Footer />
        </div>
    );
}
