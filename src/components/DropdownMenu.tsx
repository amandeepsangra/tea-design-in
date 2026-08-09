import React, { useState, useRef, useEffect } from 'react';

interface MenuItem {
  label: string;
  onClick: () => void;
  shortcut?: string;
  divider?: boolean;
}

export function DropdownMenu({ title, items }: { title: string; items: MenuItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className={`px-3 py-1 rounded text-sm cursor-pointer transition-colors ${isOpen ? 'bg-[var(--color-surface)] text-white' : 'text-gray-300 hover:bg-[var(--color-surface-hover)]'}`}
      >
        {title}
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-[var(--color-panel)] border border-[var(--color-panel-border)] rounded-md shadow-2xl py-1 z-50">
          {items.map((item, i) => (
            item.divider ? (
              <div key={i} className="h-px bg-[var(--color-panel-border)] my-1"></div>
            ) : (
              <button 
                key={i}
                onClick={() => { item.onClick(); setIsOpen(false); }}
                className="w-full text-left px-4 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-[var(--color-accent)] flex justify-between items-center cursor-pointer"
              >
                <span>{item.label}</span>
                {item.shortcut && <span className="text-xs text-gray-500 group-hover:text-gray-200">{item.shortcut}</span>}
              </button>
            )
          ))}
        </div>
      )}
    </div>
  );
}
