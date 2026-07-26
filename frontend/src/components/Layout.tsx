import type { ReactNode } from "react";
import type { Page } from "../lib/types";
import Sidebar from "./Sidebar";

interface LayoutProps {
  children: ReactNode;
  current: Page;
  onLogout?: () => void;
}

export default function Layout({ children, current, onLogout }: LayoutProps) {
  return (
    <div className="flex h-screen bg-[#f6f8fa] overflow-hidden">
      <Sidebar current={current} onLogout={onLogout} />
      <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
    </div>
  );
}