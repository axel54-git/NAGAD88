import { memo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Users, ListTodo, Wallet, User as UserIcon } from 'lucide-react';
import { triggerHaptic } from '../lib/telegram';
import taskCenterLogo from '../assets/images/task_center_logo.webp';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  center?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/refer", label: "Refer", icon: Users },
  { to: "/tasks", label: "Task", icon: ListTodo, center: true },
  { to: "/wallet", label: "Wallet", icon: Wallet },
  { to: "/profile", label: "Profile", icon: UserIcon }
];

export const BottomNav = memo(function BottomNav() {
  const { pathname } = useLocation();

  if (pathname.startsWith('/admin')) {
    return null;
  }

  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-3 bottom-2.5 z-40 mx-auto flex h-14 max-w-[424px] items-stretch rounded-full border border-amber-400/35 bg-gradient-to-b from-[#160a04]/97 via-[#0e0602]/98 to-[#060301]/99 px-2 backdrop-blur-xl shadow-[0_16px_36px_-4px_rgba(0,0,0,0.96),inset_0_1px_0_rgba(255,224,168,0.22)]"
    >
      {NAV_ITEMS.map(({ to, label, icon: Icon, center }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          onClick={() => triggerHaptic("light")}
          className="relative flex flex-1 flex-col items-center justify-center gap-0.5"
        >
          {({ isActive }) =>
            center ? (
              <>
                <span
                  className={`-mt-6 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 bg-[#0a0401] shadow-[0_6px_22px_rgba(243,196,107,0.5)] transition-transform active:scale-95 ${
                    isActive
                      ? "border-amber-300 ring-2 ring-amber-400/45"
                      : "border-amber-500/80"
                  }`}
                >
                  <img
                    src={taskCenterLogo}
                    alt={label}
                    width={48}
                    height={48}
                    loading="eager"
                    decoding="sync"
                    fetchPriority="high"
                    draggable={false}
                    className="h-full w-full scale-[1.06] object-cover select-none"
                  />
                </span>
                <span
                  className={`text-[10px] tracking-wide ${
                    isActive ? "font-extrabold text-amber-300" : "font-semibold text-amber-100/65"
                  }`}
                >
                  {label}
                </span>
              </>
            ) : (
              <>
                <Icon
                  className={`h-[18px] w-[18px] transition-colors ${
                    isActive
                      ? "text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.55)]"
                      : "text-amber-100/60"
                  }`}
                  strokeWidth={isActive ? 2.3 : 1.8}
                />
                <span
                  className={`text-[10px] tracking-wide ${
                    isActive ? "font-extrabold text-amber-300" : "font-medium text-amber-100/60"
                  }`}
                >
                  {label}
                </span>
              </>
            )
          }
        </NavLink>
      ))}
    </nav>
  );
});
