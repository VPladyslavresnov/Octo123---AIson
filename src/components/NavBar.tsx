import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { User, Home, Sparkles, Heart, Calendar, Menu, X, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";

const navItems = [
  { label: "Agent", path: "/agent", icon: MessageCircle },
  { label: "Content Studio", path: "/content-studio", icon: Home },
  { label: "Campaigns", path: "/campaigns", icon: Sparkles },
  { label: "Library", path: "/library", icon: Heart },
  { label: "Schedule", path: "/scheduled", icon: Calendar },
];

export function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleNav = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const isActive = (path: string) => location.pathname === path;
  const isHomePage = location.pathname === "/";
  const isSignupPage = location.pathname === "/signup";

  if (isHomePage || isSignupPage) return null;

  return (
    <nav className="bg-card/80 backdrop-blur-md border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-6">
            <Button
              variant="ghost"
              onClick={() => navigate(user ? "/dashboard" : "/")}
              className="flex items-center gap-2"
            >
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="font-semibold text-foreground">AIson</span>
            </Button>

            {/* Desktop nav */}
            {user && (
              <div className="hidden md:flex items-center gap-1">
                {navItems.map((item) => (
                  <Button
                    key={item.path}
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(item.path)}
                    className={`flex items-center gap-2 ${isActive(item.path) ? "bg-accent text-accent-foreground" : ""}`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(user ? "/account" : "/auth")}
              className="flex items-center gap-2"
            >
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">{user ? "Account" : "Login"}</span>
            </Button>

            {/* Mobile hamburger */}
            {user && (
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-64 p-0">
                  <div className="flex items-center justify-between px-4 h-16 border-b border-border">
                    <span className="font-semibold text-foreground">Menu</span>
                    <SheetClose asChild>
                      <Button variant="ghost" size="icon" aria-label="Close menu">
                        <X className="w-5 h-5" />
                      </Button>
                    </SheetClose>
                  </div>
                  <div className="flex flex-col py-2">
                    {navItems.map((item) => (
                      <button
                        key={item.path}
                        onClick={() => handleNav(item.path)}
                        className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-accent ${isActive(item.path) ? "bg-accent text-accent-foreground" : "text-foreground"}`}
                      >
                        <item.icon className="w-4 h-4" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
