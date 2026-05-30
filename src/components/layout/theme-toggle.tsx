"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  // Avoid hydration mismatch: render a stable placeholder until mounted
  if (!mounted) {
    return (
      <button
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-gray-400"
        aria-hidden
      >
        <Moon className="h-5 w-5 flex-shrink-0" />
        {!collapsed && <span>Tema</span>}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      title={isDark ? "Prebaci na svetlu temu" : "Prebaci na tamnu temu"}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 w-full text-gray-400 hover:text-[#f5e6c8] hover:bg-white/5"
      )}
    >
      {isDark ? (
        <Sun className="h-5 w-5 flex-shrink-0" />
      ) : (
        <Moon className="h-5 w-5 flex-shrink-0" />
      )}
      {!collapsed && <span>{isDark ? "Svetla tema" : "Tamna tema"}</span>}
    </button>
  );
}
