import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { AuthGate } from './components/AuthGate';
import { ChannelVerificationGate } from './components/ChannelVerificationGate';
import { BottomNav } from './components/BottomNav';
import { BrandTopHeader } from './components/BrandTopHeader';
import { Home } from './pages/Home';
import { Refer } from './pages/Refer';
import { RankList } from './pages/RankList';
import { Wallet } from './pages/Wallet';
import { PaymentHistory } from './pages/PaymentHistory';
import { CashOut } from './pages/CashOut';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { Admin } from './pages/Admin';
import { VideoWatch } from './pages/VideoWatch';
import { Tasks } from './pages/Tasks';
import { TaskDetails } from './pages/TaskDetails';
import { TaskHistory } from './pages/TaskHistory';
import { useAuth } from './contexts/AuthContext';
import { getYouTubeThumbnail } from './lib/youtube';
import { preloadPermanentImages } from './lib/imageCache';
import referInviteBanner from './assets/images/refer_invite_banner.webp';
import referRulesBanner from './assets/images/refer_rules_banner.webp';
import headerLogo from './assets/images/header_logo_clean.webp';
import taskCenterLogo from './assets/images/task_center_logo.webp';
import siteBgImage from './assets/images/site_bg.jpg';
import bkashIcon from './assets/images/bkash_icon.webp';
import nagadIcon from './assets/images/nagad_icon.webp';
import binanceIcon from './assets/images/binance_icon.webp';

if (typeof window !== 'undefined') {
  preloadPermanentImages([
    headerLogo,
    siteBgImage,
    taskCenterLogo,
    referInviteBanner,
    referRulesBanner,
    bkashIcon,
    nagadIcon,
    binanceIcon
  ]);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw-images.js').catch(() => {});
  }
}

function DynamicImagePreloader() {
  const { user, config } = useAuth();

  useEffect(() => {
    const urls: Array<string | null | undefined> = [user?.photoUrl];

    if (Array.isArray(config.taskPosts)) {
      for (const post of config.taskPosts) {
        if (post?.bannerUrl) urls.push(post.bannerUrl);
      }
    }

    if (Array.isArray(config.videos)) {
      for (const video of config.videos) {
        if (video?.youtubeUrl) urls.push(getYouTubeThumbnail(video.youtubeUrl));
      }
    }

    preloadPermanentImages(urls);
  }, [user?.photoUrl, config.taskPosts, config.videos]);

  return null;
}

function AdminAutoRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const search = window.location.search || location.search || '';
      const searchParams = new URLSearchParams(search);
      const tgStart = (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param;
      const winPath = (window.location.pathname || '').toLowerCase();
      const locPath = (location.pathname || '').toLowerCase();

      const shouldBeAdmin =
        winPath === '/admin' ||
        winPath === '/admin/' ||
        winPath === '/admin.html' ||
        winPath.startsWith('/admin') ||
        locPath === '/admin/' ||
        locPath === '/admin.html' ||
        hash === '#/admin' ||
        hash === '#admin' ||
        hash.startsWith('#/admin') ||
        hash.startsWith('#admin') ||
        searchParams.get('page') === 'admin' ||
        searchParams.has('admin') ||
        tgStart === 'admin';

      if (shouldBeAdmin && location.pathname !== '/admin') {
        navigate('/admin', { replace: true });
      }
    } catch {}
  }, [location, navigate]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AdminAutoRedirect />
      <Toaster position="top-center" richColors closeButton toastOptions={{ duration: 4000 }} />
      <Routes>
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/admin/" element={<Admin />} />
        <Route path="/admin.html" element={<Admin />} />
        <Route path="admin" element={<Admin />} />
        <Route path="admin/*" element={<Admin />} />
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </BrowserRouter>
  );
}

const MAIN_TABS = new Set(['/', '/refer', '/tasks', '/wallet', '/profile']);

function AppShell() {
  const { pathname } = useLocation();
  const normalizedPath = pathname === "/task" ? "/tasks" : pathname;
  const isMainTab = MAIN_TABS.has(normalizedPath);
  const [visitedTabs, setVisitedTabs] = useState<string[]>(() =>
    isMainTab ? [normalizedPath] : ['/']
  );

  useEffect(() => {
    if (isMainTab) {
      setVisitedTabs((prev) => (prev.includes(normalizedPath) ? prev : [...prev, normalizedPath]));
    }
  }, [isMainTab, normalizedPath]);

  const hideBottomPadding = pathname === "/wallet/cashout" || pathname.startsWith("/video");
  const showBrandHeader = normalizedPath === '/' || normalizedPath === '/refer' || normalizedPath === '/tasks';

  return (
    <AuthProvider>
      <DynamicImagePreloader />
      <AuthGate>
        <ChannelVerificationGate>
          <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-[#140b05] shadow-2xl relative">
            <div className={showBrandHeader ? 'block shrink-0' : 'hidden'}>
              <BrandTopHeader />
            </div>
            <div className={`luxury-page-shell flex-1 ${hideBottomPadding ? "" : "pb-20"}`}>
              {visitedTabs.includes('/') && (
                <div className={normalizedPath === '/' ? 'block' : 'hidden'}>
                  <Home />
                </div>
              )}
              {visitedTabs.includes('/refer') && (
                <div className={normalizedPath === '/refer' ? 'block' : 'hidden'}>
                  <Refer />
                </div>
              )}
              {visitedTabs.includes('/tasks') && (
                <div className={normalizedPath === '/tasks' ? 'block' : 'hidden'}>
                  <Tasks />
                </div>
              )}
              {visitedTabs.includes('/wallet') && (
                <div className={normalizedPath === '/wallet' ? 'block' : 'hidden'}>
                  <Wallet />
                </div>
              )}
              {visitedTabs.includes('/profile') && (
                <div className={normalizedPath === '/profile' ? 'block' : 'hidden'}>
                  <Profile />
                </div>
              )}

              {!isMainTab && (
                <Routes>
                  <Route path="/video/:videoId" element={<VideoWatch />} />
                  <Route path="/tasks/history" element={<TaskHistory />} />
                  <Route path="/tasks/:taskId" element={<TaskDetails />} />
                  <Route path="/task" element={<Navigate to="/tasks" replace />} />
                  <Route path="/rank" element={<RankList />} />
                  <Route path="/wallet/payments" element={<PaymentHistory />} />
                  <Route path="/wallet/history" element={<PaymentHistory />} />
                  <Route path="/wallet/cashout" element={<CashOut />} />
                  <Route path="/profile/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              )}
            </div>
            {!pathname.startsWith("/video") && <BottomNav />}
          </div>
        </ChannelVerificationGate>
      </AuthGate>
    </AuthProvider>
  );
}
