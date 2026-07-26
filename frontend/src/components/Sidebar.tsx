import { LayoutDashboard, Upload, ClipboardList, History, LogOut } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import type { Page } from "../lib/types";

interface SidebarProps {
  current: Page;
  onLogout?: () => void;
}

export default function Sidebar({ onLogout }: SidebarProps) {
  const navigate = useNavigate();

  const items = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { key: "upload", label: "Upload", icon: Upload, path: "/upload" },
{ key: "horses", label: "Horses", icon: ClipboardList, path: "/horses" },
    { key: "sessions", label: "Sessions", icon: History, path: "/sessions" },
  ] as const;

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
      <div className="px-5 py-5 border-b border-slate-200">
        <h1 className="text-lg font-semibold text-slate-900">Equine Analytics</h1>
        <p className="text-xs text-slate-500 mt-1">Gait analysis platform</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.key}
              to={item.path}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-teal-50 text-teal-700 font-medium"
                    : "text-slate-700 hover:bg-slate-100"
                }`
              }
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200">
        <button
          onClick={() => {
            if (onLogout) onLogout();
            navigate("/logout");
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}