"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  Download,
  Library,
  Search,
  Settings,
  Waves
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/browse", label: "Browse", icon: Search },
  { href: "/books", label: "Books", icon: Library },
  { href: "/downloads", label: "Downloads", icon: Download },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    function logClientError(message: string, detail?: string) {
      void fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: "error",
          source: "browser",
          message,
          detail,
          url: window.location.href,
          userAgent: navigator.userAgent
        })
      }).catch(() => undefined);
    }

    function onError(event: ErrorEvent) {
      logClientError(event.message || "Browser error", event.error?.stack ?? `${event.filename}:${event.lineno}:${event.colno}`);
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      logClientError(reason?.message ?? "Unhandled promise rejection", reason?.stack ?? String(reason ?? ""));
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return (
    <div className="min-h-screen bg-surface text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-line bg-[#131722] lg:block">
        <div className="flex min-h-36 flex-col items-center justify-center gap-2 border-b border-line px-5 py-5 text-center">
          <Image alt="BookBridge" className="h-auto w-28" height={124} priority src="/images/bookbridge.svg" width={224} />
          <div className="text-base font-semibold tracking-wide text-slate-100">BookBridge</div>
          <div className="text-xs text-slate-500">Media automation</div>
        </div>
        <nav className="space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                className={cn(
                  "flex h-10 items-center gap-3 rounded px-3 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-100",
                  active && "bg-gradient-to-r from-[#C89B3C]/15 to-[#7C3AED]/15 text-[#F5F7FB] ring-1 ring-[#C89B3C]/20"
                )}
                href={item.href}
                key={item.href}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-line p-4">
          <div className="flex items-center gap-3 rounded border border-line bg-panel p-3">
            <Waves className="text-[#7C3AED]" size={18} />
            <div>
              <div className="text-xs font-medium text-slate-200">Local control panel</div>
              <div className="text-xs text-slate-500">Prowlarr + SAB + qBit</div>
            </div>
          </div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-line bg-surface/85 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <Link href="/browse" className="flex items-center gap-2 font-semibold">
              <Image alt="" className="h-7 w-auto" height={124} priority src="/images/bookbridge.svg" width={224} />
              <span>BookBridge</span>
            </Link>
            <Link href="/settings" aria-label="Settings">
              <Settings size={20} />
            </Link>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  className={cn(
                    "whitespace-nowrap rounded border border-line px-3 py-1.5 text-xs text-slate-400",
                    active && "border-[#C89B3C]/30 bg-gradient-to-r from-[#C89B3C]/15 to-[#7C3AED]/15 text-[#F5F7FB]"
                  )}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
