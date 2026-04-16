import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { OfflineBanner } from "@/components/layout/offline-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = {
    name: session.user.name,
    email: session.user.email,
    role: (session.user as { role: string }).role,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0">
        <Sidebar user={user} />
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col lg:pl-64 min-w-0 overflow-hidden">
        {/* Mobile nav header */}
        <MobileNav user={user} />

        {/* Offline banner */}
        <OfflineBanner />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-background">
          <div className="container mx-auto max-w-7xl p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
