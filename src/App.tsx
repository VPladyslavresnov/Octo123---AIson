import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { AuthGuard } from "./components/AuthGuard";
import Landing from "./pages/Landing";
import MainPage from "./pages/MainPage";
import ContentStudio from "./pages/ContentStudio";
import Auth from "./pages/Auth";
import Signup from "./pages/Signup";
import Account from "./pages/Account";
import Campaigns from "./pages/Campaigns";
import NewCampaign from "./pages/NewCampaign";
import CampaignDetail from "./pages/CampaignDetail";
import Library from "./pages/Library";
import ScheduledPosts from "./pages/ScheduledPosts";
import Onboarding from "./pages/Onboarding";
import Posting from "./pages/Posting";
import Analytics from "./pages/Analytics";
import Admin from "./pages/Admin";
import Brands from "./pages/Brands";
import AboutProduct from "./pages/AboutProduct";
import AboutUs from "./pages/AboutUs";
import Contact from "./pages/Contact";
import FAQs from "./pages/FAQs";
import NotFound from "./pages/NotFound";
import { shouldBypassAuth } from "./lib/localAccessBypass";

const queryClient = new QueryClient();

const App = () => (
  (() => {
    const bypassAuth = typeof window !== "undefined" && shouldBypassAuth();

    if (
      typeof window !== "undefined" &&
      import.meta.env.DEV &&
      window.location.hostname === "localhost"
    ) {
      const normalizedUrl = `http://127.0.0.1:${window.location.port}${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(normalizedUrl);
      return null;
    }

    return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes — no sidebar */}
          <Route path="/" element={bypassAuth ? <Navigate to="/home" replace /> : <Landing />} />
          <Route path="/auth" element={bypassAuth ? <Navigate to="/home" replace /> : <Auth />} />
          <Route path="/signup" element={bypassAuth ? <Navigate to="/home" replace /> : <Signup />} />
          <Route path="/onboarding" element={bypassAuth ? <Navigate to="/home" replace /> : <Onboarding />} />
          <Route path="/about-product" element={<AboutProduct />} />
          <Route path="/about-us" element={<AboutUs />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/faqs" element={<FAQs />} />
          <Route path="/news" element={<Navigate to="/" replace />} />

          {/* App routes — require a real session, then sidebar layout */}
          <Route element={<AuthGuard />}>
          <Route element={<AppLayout />}>
            <Route path="/home" element={<MainPage />} />
            <Route path="/dashboard" element={<Navigate to="/home" replace />} />
            <Route path="/content-studio" element={<ContentStudio />} />
            <Route path="/studio" element={<Navigate to="/content-studio" replace />} />
            <Route path="/agent" element={<MainPage />} />
            <Route path="/account" element={<Account />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaign/new" element={<NewCampaign />} />
            <Route path="/campaign/:id" element={<CampaignDetail />} />
            <Route path="/library" element={<Library />} />
            <Route path="/brands" element={<Brands />} />
            <Route path="/scheduled" element={<ScheduledPosts />} />
            <Route path="/posting" element={<Posting />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
          </Route>

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
    );
  })()
);

export default App;
