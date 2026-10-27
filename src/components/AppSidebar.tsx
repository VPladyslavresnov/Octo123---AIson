import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Wand2,
  Megaphone,
  CalendarClock,
  Send,
  BarChart3,
  FolderOpen,
  User,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isAdminEmail, checkIsAdmin } from "@/lib/admin";
import { useBrands } from "@/hooks/useBrands";
import { loadSummary } from "@/lib/rewards";
import { Check, ChevronsUpDown, Star } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

const mainNav = [
  { title: "Main Page", url: "/home", icon: LayoutDashboard },
  { title: "Brands", url: "/brands", icon: Sparkles },
  { title: "Content Studio", url: "/content-studio", icon: Wand2 },
  { title: "Campaigns", url: "/campaigns", icon: Megaphone },
  { title: "Scheduler", url: "/scheduled", icon: CalendarClock },
  { title: "Posting", url: "/posting", icon: Send },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Library", url: "/library", icon: FolderOpen },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user || !alive) return;
      setUserEmail(session.user.email || "");
      setUserName(session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "");
      setIsAdmin(isAdminEmail(session.user.email));
      checkIsAdmin(session.user.id, session.user.email).then((v) => { if (alive) setIsAdmin(v); });
      const refreshStars = () => loadSummary(session.user.id).then((s) => { if (alive) setStars(s.total); });
      refreshStars();
      window.addEventListener("aison:stars-updated", refreshStars);
      window.addEventListener("aison:star-earned", refreshStars);
      (window as any).__aisonStarsCleanup = () => {
        window.removeEventListener("aison:stars-updated", refreshStars);
        window.removeEventListener("aison:star-earned", refreshStars);
      };
    });
    return () => { alive = false; (window as any).__aisonStarsCleanup?.(); };
  }, []);

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => navigate("/home")} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            {!collapsed && <span className="font-bold text-lg text-foreground tracking-tight truncate">AIson</span>}
          </button>
          <SidebarTrigger className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" />
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {!collapsed && <BrandSwitcher />}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                    className={isActive(item.url) ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isAdmin && (
                <SidebarMenuItem key="Admin">
                  <SidebarMenuButton
                    onClick={() => navigate("/admin")}
                    isActive={isActive("/admin")}
                    tooltip="Admin"
                    className={isActive("/admin") ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Admin</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <button
          onClick={() => navigate("/account?tab=rewards")}
          title="Collect Your Stars"
          className={`flex items-center ${collapsed ? "justify-center" : "gap-2"} w-full p-2 mb-1 rounded-lg border border-amber-300/25 bg-amber-300/5 hover:bg-amber-300/10 transition-colors text-left`}
        >
          <Star className="w-4 h-4 shrink-0 fill-amber-300 text-amber-300" />
          {!collapsed && (
            <>
              <span className="text-sm font-medium text-foreground flex-1">Your Stars</span>
              <span className="text-sm font-bold tabular-nums text-amber-300">{stars ?? "—"}</span>
            </>
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-accent transition-colors text-left">
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                  {userName ? userName.charAt(0).toUpperCase() : "U"}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{userName || "User"}</p>
                  <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem onClick={() => navigate("/account")}>
              <User className="w-4 h-4 mr-2" />Account Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive">
              <LogOut className="w-4 h-4 mr-2" />Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function BrandSwitcher() {
  const navigate = useNavigate();
  const { brands, activeBrand, activeBrandId, loading, setActive } = useBrands();

  if (loading || brands.length === 0) return null;

  return (
    <div className="px-3 pt-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 w-full p-2 rounded-lg border border-border hover:bg-accent transition-colors text-left">
            <div className="w-6 h-6 rounded bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Active brand</p>
              <p className="text-sm font-medium text-foreground truncate leading-none">{activeBrand?.brand_name || "Select"}</p>
            </div>
            <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {brands.map((b) => (
            <DropdownMenuItem key={b.id} onClick={() => setActive(b.id)} className="gap-2">
              <Check className={`w-4 h-4 ${b.id === activeBrandId ? "opacity-100 text-primary" : "opacity-0"}`} />
              <span className="truncate">{b.brand_name || "Untitled brand"}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/brands")} className="gap-2 text-muted-foreground">
            <Sparkles className="w-4 h-4" /> Manage brands
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
