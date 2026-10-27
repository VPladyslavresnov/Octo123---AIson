import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { FloatingAssistant } from "@/components/FloatingAssistant";
import { RewardsEngine } from "@/components/RewardsEngine";
import { ParticleField } from "@/components/home/ParticleField";
import { Outlet } from "react-router-dom";

export function AppLayout() {
  return (
    <SidebarProvider>
      {/* Loyalty gamification: records daily login + awards event-based stars */}
      <RewardsEngine />
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Global animated orange circles background */}
          <ParticleField />

          <header className="h-12 flex items-center border-b border-border px-4 bg-background/80 backdrop-blur-sm sticky top-0 z-40 md:hidden">
            <SidebarTrigger />
          </header>

          <main className="flex-1 relative z-10">
            <Outlet />
          </main>

          {/* Floating AI assistant on all pages except Main */}
          <FloatingAssistant />
        </div>
      </div>
    </SidebarProvider>
  );
}
