import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
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
import AboutProduct from "./pages/AboutProduct";
import AboutUs from "./pages/AboutUs";
import Contact from "./pages/Contact";
import FAQs from "./pages/FAQs";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes — no sidebar */}
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/about-product" element={<AboutProduct />} />
          <Route path="/about-us" element={<AboutUs />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/faqs" element={<FAQs />} />
          <Route path="/news" element={<Navigate to="/" replace />} />

          {/* App routes — sidebar layout with animated background */}
          <Route element={<AppLayout />}>
            <Route path="/home" element={<MainPage />} />
            <Route path="/dashboard" element={<Navigate to="/home" replace />} />
            <Route path="/content-studio" element={<Navigate to="/home" replace />} />
            <Route path="/studio" element={<Navigate to="/home" replace />} />
            <Route path="/agent" element={<Navigate to="/home" replace />} />
            <Route path="/account" element={<Account />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaign/new" element={<NewCampaign />} />
            <Route path="/campaign/:id" element={<CampaignDetail />} />
            <Route path="/library" element={<Library />} />
            <Route path="/scheduled" element={<ScheduledPosts />} />
            <Route path="/posting" element={<Posting />} />
            <Route path="/analytics" element={<Analytics />} />
          </Route>

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
