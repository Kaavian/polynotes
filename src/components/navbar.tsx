"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { Moon, Sun, Mic } from "lucide-react";
import { useEffect, useState } from "react";

export function Navbar() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border glass-panel rounded-none shadow-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-xl tracking-tight">
          <div className="bg-indigo-600 p-1.5 rounded-lg flex items-center justify-center">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <span className="text-gradient font-bold transition-all duration-300">PolyNotes</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm font-medium opacity-80 hover:opacity-100 transition-opacity">
            Dashboard
          </Link>
          <Link href="/new" className="text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-full transition-colors">
            New Meeting
          </Link>
          {mounted && (
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 rounded-full hover:bg-surface-hover transition-colors ml-2"
            >
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
