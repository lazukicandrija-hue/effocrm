"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import ThemeToggle from "./theme-toggle";
import {
  LayoutDashboard,
  UserCircle,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Camera,
  UsersRound,
  Film,
  Lightbulb,
  Swords,
  Frame,
  Wand2,
  Smartphone,
  Type,
  Images,
  Brain,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Content Brain", href: "/brain", icon: Brain },
  { name: "Accounts", href: "/accounts", icon: Camera },
  { name: "Phones", href: "/phones", icon: Smartphone },
  { name: "Reels Analytics", href: "/reels", icon: Film },
  { name: "First Frame", href: "/prompter", icon: Frame },
  { name: "Auto-Recreate", href: "/auto-recreate", icon: Wand2 },
  { name: "Captioner", href: "/captioner", icon: Type },
  { name: "Reference Images", href: "/reference-images", icon: Images },
  { name: "Competitors", href: "/competitors", icon: Swords },
  { name: "Marketing", href: "/marketing", icon: Lightbulb },
  { name: "Models", href: "/models", icon: UserCircle },
  { name: "Team", href: "/team", icon: UsersRound },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen flex flex-col transition-all duration-300 ease-in-out",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
      style={{ backgroundColor: "#0a0a0a" }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-[72px] border-b border-white/5">
        {!collapsed && (
          <div className="flex flex-col">
            <span
              className="text-xl font-serif tracking-wide"
              style={{ color: "#f5e6c8" }}
            >
              effortless
            </span>
            <span
              className="text-[10px] font-sans tracking-[0.3em] uppercase -mt-1"
              style={{ color: "#d4a853" }}
            >
              MGMT
            </span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          style={{ color: "#f5e6c8" }}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                isActive
                  ? "bg-[#d4a853]/10 text-[#d4a853]"
                  : "text-gray-400 hover:text-[#f5e6c8] hover:bg-white/5"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 flex-shrink-0 transition-colors",
                  isActive ? "text-[#d4a853]" : "text-gray-500 group-hover:text-[#f5e6c8]"
                )}
              />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-white/5">
        <div className="mb-1">
          <ThemeToggle collapsed={collapsed} />
        </div>
        {!collapsed && session?.user && (
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-medium" style={{ color: "#f5e6c8" }}>
              {session.user.name}
            </p>
            <p className="text-xs text-gray-500">{session.user.email}</p>
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 w-full text-gray-400 hover:text-red-400 hover:bg-red-400/5"
          )}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
