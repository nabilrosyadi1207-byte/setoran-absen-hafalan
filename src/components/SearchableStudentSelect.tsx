import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { Student } from '../types';

interface SearchableStudentSelectProps {
  students: Student[];
  value: string;
  onChange: (studentId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowAll?: boolean;
  allLabel?: string;
}

export function SearchableStudentSelect({
  students,
  value,
  onChange,
  placeholder = 'Ketik nama atau NIS santri...',
  disabled = false,
  required = false,
  allowAll = false,
  allLabel = 'Semua Santri',
}: SearchableStudentSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);

  const selectedStudent = useMemo(
    () => students.find((s) => String(s.id) === value) || null,
    [students, value]
  );

  // Put Aktif students first, then others, preserving alphabetical order inside groups
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const aActive = a.status === 'Aktif' ? 0 : 1;
      const bActive = b.status === 'Aktif' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.full_name.localeCompare(b.full_name, 'id');
    });
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedStudents;
    return sortedStudents.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.nis.toLowerCase().includes(q) ||
        (s.class_name || '').toLowerCase().includes(q)
    );
  }, [sortedStudents, query]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query, open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function selectStudent(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;

    const totalItems = (allowAll ? 1 : 0) + filteredStudents.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (totalItems > 0) setHighlightIndex((prev) => (prev + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (totalItems > 0) setHighlightIndex((prev) => (prev - 1 + totalItems) % totalItems);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allowAll && highlightIndex === 0) {
        selectStudent('all');
        return;
      }
      const idx = allowAll ? highlightIndex - 1 : highlightIndex;
      const target = filteredStudents[idx];
      if (target) selectStudent(String(target.id));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
    }
  }

  const closedLabel = allowAll && value === 'all'
    ? allLabel
    : selectedStudent
      ? `${selectedStudent.full_name} (${selectedStudent.nis})`
      : '';

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          required={required && !value}
          value={open ? query : closedLabel}
          placeholder={
            open
              ? selectedStudent
                ? `Cari santri... (Terpilih: ${selectedStudent.full_name})`
                : placeholder
              : placeholder
          }
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              setQuery('');
            }
          }}
          onClick={() => {
            if (!disabled && !open) {
              setOpen(true);
              setQuery('');
            }
          }}
          onChange={(e) => {
            if (!open) setOpen(true);
            setQuery(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          aria-expanded={open}
          aria-autocomplete="list"
          role="combobox"
          className="w-full pl-9 pr-16 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-100 disabled:text-slate-500"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {(query || (!allowAll && value)) && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              title="Kosongkan pilihan"
              onClick={() => {
                if (open && query) {
                  setQuery('');
                } else {
                  onChange(allowAll ? 'all' : '');
                  setQuery('');
                  setOpen(true);
                }
                inputRef.current?.focus();
              }}
              className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => {
              if (open) {
                setOpen(false);
                setQuery('');
              } else {
                setOpen(true);
                setQuery('');
                inputRef.current?.focus();
              }
            }}
            className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto py-1">
          {allowAll && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectStudent('all');
              }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between cursor-pointer ${
                highlightIndex === 0 ? 'bg-emerald-50 text-emerald-900' : 'hover:bg-slate-50 text-slate-800'
              }`}
            >
              <span className="font-medium">{allLabel}</span>
              {value === 'all' && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
            </button>
          )}

          {filteredStudents.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-slate-500">
              Santri &ldquo;{query}&rdquo; tidak ditemukan.
            </div>
          ) : (
            filteredStudents.map((s, idx) => {
              const itemIndex = allowAll ? idx + 1 : idx;
              const isSelected = String(s.id) === value;
              const isHighlighted = highlightIndex === itemIndex;
              return (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectStudent(String(s.id));
                  }}
                  onMouseEnter={() => setHighlightIndex(itemIndex)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 cursor-pointer ${
                    isHighlighted ? 'bg-emerald-50 text-emerald-900' : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {s.full_name}
                      {s.status !== 'Aktif' && (
                        <span className="ml-1.5 text-[11px] font-normal text-red-600">
                          ({s.status})
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500">
                      NIS {s.nis} · {s.gender === 'L' ? 'Putra' : 'Putri'}
                    </p>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
