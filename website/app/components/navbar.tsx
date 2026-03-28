"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const links = [
  { href: "#problem", label: "Problem" },
  { href: "#solution", label: "Solution" },
  { href: "#features", label: "Features" },
  { href: "#stack", label: "Tech Stack" },
  { href: "#impact", label: "Impact" },
];

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/85 backdrop-blur-lg">
      <nav className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4 lg:px-8">
        <a href="#top" className="flex items-center gap-2">
          <span className="overflow-hidden rounded-md border border-orange-500/50 bg-orange-500/15 p-1 text-orange-400">
            <Image
              src="/logo/3.png"
              alt="BEACON logo"
              width={24}
              height={24}
              className="h-6 w-6 rounded-sm object-cover"
            />
          </span>
          <span className="text-sm font-semibold tracking-[0.18em] text-white sm:text-base">
            BEACON
          </span>
        </a>

        <div className="flex items-center gap-2">
          <ul className="hidden items-center gap-5 text-sm text-slate-300 md:flex">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="transition hover:text-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/80"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <Link
            href="/login"
            className="hidden rounded-full border border-white/30 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-yellow-300 hover:text-yellow-200 sm:inline-flex sm:px-4 sm:text-sm"
          >
            Login / Register
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex items-center justify-center rounded-md border border-white/20 p-2 text-slate-200 md:hidden"
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
          >
            {menuOpen ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Menu className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>

        {menuOpen ? (
          <div className="w-full rounded-xl border border-white/10 bg-slate-900/85 p-3 md:hidden">
            <ul className="space-y-1 text-sm text-slate-200">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-md px-3 py-2 transition hover:bg-white/5 hover:text-orange-300"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="mt-1 block rounded-md bg-orange-500 px-3 py-2 text-center font-semibold text-white"
                >
                  Login / Register
                </Link>
              </li>
            </ul>
          </div>
        ) : null}
      </nav>
    </header>
  );
}
