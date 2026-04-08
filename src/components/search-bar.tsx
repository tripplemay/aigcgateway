"use client";

import { cn } from "@/lib/utils";

interface SearchBarProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
}

export function SearchBar({ placeholder, value, onChange, onKeyDown, className }: SearchBarProps) {
  return (
    <div className={cn("relative", className)}>
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-ds-on-surface-variant text-sm">
        search
      </span>
      <input
        className="w-full pl-9 pr-8 py-2 text-sm rounded-full bg-ds-surface-container-low border-none focus:ring-2 focus:ring-ds-primary/20 placeholder:text-ds-on-surface-variant/60 outline-none transition-all"
        placeholder={placeholder}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ds-on-surface-variant hover:text-ds-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      )}
    </div>
  );
}
