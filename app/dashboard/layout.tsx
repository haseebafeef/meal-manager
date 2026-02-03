import BackgroundWrapper from "@/app/ui/background-wrapper";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <BackgroundWrapper>
            {children}
        </BackgroundWrapper>
    );
}
