import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Download, FileText, RotateCcw, Save, Search, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  exportAttendanceRecapExcel,
  exportAttendanceRecapPdf,
  exportMonthlyAttendanceExcel,
  exportMonthlyAttendancePdf,
} from '../lib/exportReports';
import {
  ATTENDANCE_SESSIONS,
  ATTENDANCE_SUBJECTS,
  ATTENDANCE_TEACHERS,
  type AttendanceRecapRow,
  type AttendanceRecord,
  type AttendanceSession,
  type AttendanceStatus,
  type InstitutionSettings,
  type Student,
} from '../types';

interface AttendanceViewProps {
  settings: InstitutionSettings;
}

type AttendanceTabMode = 'daily' | 'recap_daily' | 'monthly' | 'recap_monthly';

interface RecapSummary {
  hadir: number;
  sakit: number;
  izin: number;
  haid: number;
  alpha: number;
  total_records: number;
  attendance_rate: number;
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getCurrentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function renderStatusBadge(status: AttendanceStatus | '') {
  if (!status) return <span className="text-slate-300 font-mono">-</span>;
  const styles: Record<AttendanceStatus, string> = {
    H: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    S: 'bg-amber-50 text-amber-800 border-amber-200',
    I: 'bg-sky-50 text-sky-800 border-sky-200',
    HD: 'bg-rose-50 text-rose-800 border-rose-200',
    A: 'bg-red-50 text-red-800 border-red-200',
  };
  return (
    <span className={`inline-block min-w-[28px] px-1.5 py-0.5 text-[11px] font-mono font-semibold rounded border text-center ${styles[status]}`}>
      {status}
    </span>
  );
}

export function AttendanceView({ settings }: AttendanceViewProps) {
  const [mode, setMode] = useState<AttendanceTabMode>('daily');
  const [students, setStudents] = useState<Student[]>([]);

  // Attendance metadata controls: Tanggal/Bulan, Mata Pelajaran, Guru Pengampu, Waktu Pelajaran
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthStr());
  const [subject, setSubject] = useState<string>(ATTENDANCE_SUBJECTS[0]);
  const [teacherName, setTeacherName] = useState<string>(ATTENDANCE_TEACHERS[1]);
  const [sessionType, setSessionType] = useState<AttendanceSession>('Subuh');

  // Additional filters for Recap Harian / Bulanan ("all" options allowed)
  const [recapSubjectFilter, setRecapSubjectFilter] = useState<string>('all');
  const [recapTeacherFilter, setRecapTeacherFilter] = useState<string>('all');
  const [recapSessionFilter, setRecapSessionFilter] = useState<string>('all');
  const [recapSearch, setRecapSearch] = useState<string>('');

  const [dailyDraft, setDailyDraft] = useState<Record<number, { status: AttendanceStatus | ''; notes: string }>>({});
  const [monthlyRecords, setMonthlyRecords] = useState<AttendanceRecord[]>([]);
  const [recapRows, setRecapRows] = useState<AttendanceRecapRow[]>([]);
  const [recapSummary, setRecapSummary] = useState<RecapSummary>({
    hadir: 0,
    sakit: 0,
    izin: 0,
    haid: 0,
    alpha: 0,
    total_records: 0,
    attendance_rate: 0,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function init() {
      try {
        const stuRes = await apiRequest<{ students: Student[] }>('/api/students?status=Aktif');
        setStudents(stuRes.students);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat daftar santri.');
      }
    }
    init();
  }, []);

  // 1. Load daily input attendance
  useEffect(() => {
    if (mode !== 'daily') return;
    let cancelled = false;
    async function loadDaily() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          date: selectedDate,
          subject,
          sessionType,
        });
        const res = await apiRequest<{ records: AttendanceRecord[] }>(`/api/attendance?${params.toString()}`);
        if (cancelled) return;
        const map: Record<number, { status: AttendanceStatus | ''; notes: string }> = {};
        for (const r of res.records) {
          map[r.student_id] = { status: r.status, notes: r.notes || '' };
        }
        setDailyDraft(map);
        if (res.records.length > 0 && res.records[0].teacher_name) {
          setTeacherName(res.records[0].teacher_name);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat absensi harian.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadDaily();
    return () => {
      cancelled = true;
    };
  }, [mode, selectedDate, subject, sessionType]);

  // 2. Load monthly matrix attendance
  useEffect(() => {
    if (mode !== 'monthly') return;
    let cancelled = false;
    async function loadMonthly() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          month: selectedMonth,
          subject,
          sessionType,
        });
        const res = await apiRequest<{ records: AttendanceRecord[] }>(`/api/attendance?${params.toString()}`);
        if (!cancelled) setMonthlyRecords(res.records);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat matriks absensi bulanan.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadMonthly();
    return () => {
      cancelled = true;
    };
  }, [mode, selectedMonth, subject, sessionType]);

  // 3. Load daily or monthly attendance recap
  useEffect(() => {
    if (mode !== 'recap_daily' && mode !== 'recap_monthly') return;
    let cancelled = false;
    async function loadRecap() {
      setLoading(true);
      setError('');
      try {
        const recapMode = mode === 'recap_daily' ? 'daily' : 'monthly';
        const params = new URLSearchParams({
          mode: recapMode,
          subject: recapSubjectFilter,
          teacherName: recapTeacherFilter,
          sessionType: recapSessionFilter,
        });
        if (recapMode === 'daily') {
          params.set('date', selectedDate);
        } else {
          params.set('month', selectedMonth);
        }
        const res = await apiRequest<{ rows: AttendanceRecapRow[]; summary: RecapSummary }>(
          `/api/attendance/recap?${params.toString()}`
        );
        if (!cancelled) {
          setRecapRows(res.rows);
          setRecapSummary(res.summary);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat rekap absensi.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadRecap();
    return () => {
      cancelled = true;
    };
  }, [
    mode,
    selectedDate,
    selectedMonth,
    recapSubjectFilter,
    recapTeacherFilter,
    recapSessionFilter,
  ]);

  function setStudentDaily(studentId: number, status: AttendanceStatus) {
    setDailyDraft((prev) => ({
      ...prev,
      [studentId]: { status, notes: prev[studentId]?.notes || '' },
    }));
  }

  function setStudentDailyNotes(studentId: number, notes: string) {
    setDailyDraft((prev) => ({
      ...prev,
      [studentId]: { status: prev[studentId]?.status || 'H', notes },
    }));
  }

  function markAllPresent() {
    setDailyDraft((prev) => {
      const next = { ...prev };
      for (const s of students) {
        next[s.id] = { status: 'H', notes: prev[s.id]?.notes || '' };
      }
      return next;
    });
  }

  async function saveDailyAttendance() {
    const entries = students
      .filter((s) => dailyDraft[s.id]?.status)
      .map((s) => ({
        student_id: s.id,
        class_id: s.class_id,
        status: dailyDraft[s.id]!.status,
        notes: dailyDraft[s.id]?.notes || '',
      }));

    if (entries.length === 0) {
      setError('Pilih minimal satu status kehadiran santri sebelum menyimpan.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      await apiRequest('/api/attendance/bulk', {
        method: 'POST',
        body: JSON.stringify({
          date: selectedDate,
          subject,
          teacher_name: teacherName,
          session_type: sessionType,
          entries,
        }),
      });
      setNotice(
        `Absensi ${subject} · Waktu ${sessionType} · Pengampu ${teacherName} · Tanggal ${selectedDate} berhasil disimpan untuk ${entries.length} santri.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan absensi.');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetAttendance(scope: 'daily_session' | 'daily_all' | 'monthly_session' | 'all') {
    setResetting(true);
    setError('');
    setNotice('');
    try {
      const res = await apiRequest<{ ok: boolean; deleted: number }>('/api/attendance/reset', {
        method: 'POST',
        body: JSON.stringify({
          scope,
          date: selectedDate,
          month: selectedMonth,
          session_type: sessionType,
          subject: scope === 'all' ? 'all' : subject,
        }),
      });

      if (scope === 'daily_session' || scope === 'daily_all' || scope === 'all') {
        setDailyDraft({});
      }
      if (scope === 'monthly_session' || scope === 'all') {
        setMonthlyRecords([]);
      }
      if (scope === 'all') {
        setRecapRows([]);
      }

      setResetModalOpen(false);
      const scopeLabel =
        scope === 'daily_session'
          ? `${subject} waktu ${sessionType} tanggal ${selectedDate}`
          : scope === 'daily_all'
            ? `${subject} semua waktu tanggal ${selectedDate}`
            : scope === 'monthly_session'
              ? `matriks bulan ${selectedMonth} (${subject} · ${sessionType})`
              : 'seluruh riwayat absensi dari awal';
      setNotice(`Berhasil mereset ${scopeLabel} (${res.deleted} data tersimpan dihapus).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mereset absensi.');
      setResetModalOpen(false);
    } finally {
      setResetting(false);
    }
  }

  const daysInMonth = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    if (!y || !m) return 30;
    return new Date(y, m, 0).getDate();
  }, [selectedMonth]);

  const monthlyMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const r of monthlyRecords) {
      map.set(`${r.student_id}-${r.date}`, r);
    }
    return map;
  }, [monthlyRecords]);

  async function cycleCell(student: Student, dayNum: number) {
    const dateStr = `${selectedMonth}-${String(dayNum).padStart(2, '0')}`;
    const current = monthlyMap.get(`${student.id}-${dateStr}`)?.status || null;
    const order: Array<AttendanceStatus | null> = [null, 'H', 'S', 'I', 'HD', 'A'];
    const nextStatus = order[(order.indexOf(current) + 1) % order.length];

    try {
      const res = await apiRequest<{ ok: boolean; record: AttendanceRecord | null }>('/api/attendance/toggle', {
        method: 'POST',
        body: JSON.stringify({
          student_id: student.id,
          date: dateStr,
          subject,
          teacher_name: teacherName,
          session_type: sessionType,
          status: nextStatus,
        }),
      });

      setMonthlyRecords((prev) => {
        const filtered = prev.filter((r) => !(r.student_id === student.id && r.date === dateStr));
        if (res.record) return [...filtered, res.record];
        return filtered;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui status absensi.');
    }
  }

  const dailySummary = useMemo(() => {
    let h = 0, s = 0, i = 0, hd = 0, a = 0, empty = 0;
    for (const st of students) {
      const val = dailyDraft[st.id]?.status;
      if (val === 'H') h++;
      else if (val === 'S') s++;
      else if (val === 'I') i++;
      else if (val === 'HD') hd++;
      else if (val === 'A') a++;
      else empty++;
    }
    return { h, s, i, hd, a, empty };
  }, [students, dailyDraft]);

  const filteredRecapRows = useMemo(() => {
    const q = recapSearch.trim().toLowerCase();
    if (!q) return recapRows;
    return recapRows.filter(
      (r) => r.full_name.toLowerCase().includes(q) || r.nis.toLowerCase().includes(q)
    );
  }, [recapRows, recapSearch]);

  const isRecapMode = mode === 'recap_daily' || mode === 'recap_monthly';
  const isDateMode = mode === 'daily' || mode === 'recap_daily';

  const recapExportOptions = {
    mode: (mode === 'recap_daily' ? 'daily' : 'monthly') as 'daily' | 'monthly',
    period: mode === 'recap_daily' ? selectedDate : selectedMonth,
    subjectLabel: recapSubjectFilter === 'all' ? 'Semua Mata Pelajaran' : recapSubjectFilter,
    teacherLabel: recapTeacherFilter === 'all' ? 'Semua Guru Pengampu' : recapTeacherFilter,
    sessionLabel: recapSessionFilter === 'all' ? 'Semua Waktu (Subuh–Isya)' : recapSessionFilter,
  };

  return (
    <div className="space-y-5">
      {/* Mode Navigation Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          {(
            [
              { id: 'daily', label: 'Input Absensi Harian' },
              { id: 'recap_daily', label: 'Rekap Absensi Harian' },
              { id: 'monthly', label: 'Matriks Bulanan (1–31)' },
              { id: 'recap_monthly', label: 'Rekap Absensi Bulanan' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setMode(tab.id);
                setError('');
              }}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Action Buttons per active mode */}
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'daily' && (
            <>
              <button
                type="button"
                onClick={markAllPresent}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-700" />
                <span>Tandai Semua Hadir</span>
              </button>
              <button
                type="button"
                onClick={() => setResetModalOpen(true)}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Absensi</span>
              </button>
              <button
                type="button"
                onClick={saveDailyAttendance}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Menyimpan...' : 'Simpan Absensi'}</span>
              </button>
            </>
          )}

          {mode === 'monthly' && (
            <>
              <button
                type="button"
                onClick={() => setResetModalOpen(true)}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Absensi</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  exportMonthlyAttendancePdf(
                    students,
                    monthlyRecords,
                    selectedMonth,
                    settings,
                    undefined,
                    sessionType,
                    { subjectLabel: subject, teacherLabel: teacherName }
                  )
                }
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-red-700" />
                <span>Ekspor PDF</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  exportMonthlyAttendanceExcel(
                    students,
                    monthlyRecords,
                    selectedMonth,
                    undefined,
                    sessionType,
                    { subjectLabel: subject, teacherLabel: teacherName }
                  )
                }
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Ekspor Excel</span>
              </button>
            </>
          )}

          {isRecapMode && (
            <>
              <button
                type="button"
                onClick={() => exportAttendanceRecapPdf(filteredRecapRows, settings, recapExportOptions)}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-red-700" />
                <span>Ekspor PDF</span>
              </button>
              <button
                type="button"
                onClick={() => exportAttendanceRecapExcel(filteredRecapRows, settings, recapExportOptions)}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Ekspor Excel</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Attendance Metadata Controls: Tanggal/Bulan, Mata Pelajaran, Guru Pengampu, Waktu Pelajaran */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* 1. Tanggal / Bulan */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
              {isDateMode ? 'Tanggal' : 'Bulan'}
            </label>
            {isDateMode ? (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            ) : (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            )}
          </div>

          {/* 2. Mata Pelajaran */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
              Mata Pelajaran
            </label>
            {isRecapMode ? (
              <select
                value={recapSubjectFilter}
                onChange={(e) => setRecapSubjectFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="all">Semua Mata Pelajaran</option>
                {ATTENDANCE_SUBJECTS.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setNotice('');
                }}
                className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {ATTENDANCE_SUBJECTS.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 3. Guru Pengampu */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
              Guru Pengampu
            </label>
            {isRecapMode ? (
              <select
                value={recapTeacherFilter}
                onChange={(e) => setRecapTeacherFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="all">Semua Guru Pengampu</option>
                {ATTENDANCE_TEACHERS.map((tName) => (
                  <option key={tName} value={tName}>
                    {tName}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {ATTENDANCE_TEACHERS.map((tName) => (
                  <option key={tName} value={tName}>
                    {tName}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* 4. Waktu Pelajaran (Subuh, Zuhur, Asar, Magrib, Isya) */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-xs font-semibold text-slate-700">
            Waktu Pelajaran:
          </span>
          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {isRecapMode && (
              <button
                type="button"
                onClick={() => setRecapSessionFilter('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  recapSessionFilter === 'all'
                    ? 'bg-emerald-800 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                Semua Waktu
              </button>
            )}
            {ATTENDANCE_SESSIONS.map((sess) => {
              const active = isRecapMode ? recapSessionFilter === sess : sessionType === sess;
              return (
                <button
                  key={sess}
                  type="button"
                  onClick={() => {
                    if (isRecapMode) {
                      setRecapSessionFilter(sess);
                    } else {
                      setSessionType(sess);
                      setNotice('');
                    }
                  }}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-emerald-800 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  {sess}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {notice && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-xs font-medium underline shrink-0 cursor-pointer">
            Tutup
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs font-medium underline shrink-0 cursor-pointer">
            Tutup
          </button>
        </div>
      )}

      {/* VIEW 1: DAILY INPUT */}
      {mode === 'daily' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <span className="font-medium text-slate-800">
              {selectedDate} · {subject} · {teacherName} · Waktu {sessionType} ({students.length} Santri Aktif)
            </span>
            <span className="font-mono tabular-nums">
              Hadir: {dailySummary.h} · Sakit: {dailySummary.s} · Izin: {dailySummary.i} · Haid: {dailySummary.hd} · Alpha: {dailySummary.a} · Belum diisi: {dailySummary.empty}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4 w-12 text-center">No</th>
                  <th className="py-2.5 px-4">NIS</th>
                  <th className="py-2.5 px-4">Nama Santri</th>
                  <th className="py-2.5 px-4">Status Kehadiran ({sessionType})</th>
                  <th className="py-2.5 px-4">Keterangan / Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-500">
                      Memuat daftar absensi {subject} ({sessionType})...
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-500">
                      Tidak ada santri aktif untuk ditampilkan.
                    </td>
                  </tr>
                ) : (
                  students.map((st, idx) => {
                    const current = dailyDraft[st.id]?.status || '';
                    const noteVal = dailyDraft[st.id]?.notes || '';
                    return (
                      <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 text-center font-mono text-xs text-slate-500 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums">
                          {st.nis}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900">{st.full_name}</p>
                        </td>
                        <td className="py-3 px-4">
                          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                            {(
                              [
                                { code: 'H', label: 'Hadir', active: 'bg-emerald-700 text-white' },
                                { code: 'S', label: 'Sakit', active: 'bg-amber-600 text-white' },
                                { code: 'I', label: 'Izin', active: 'bg-sky-700 text-white' },
                                { code: 'HD', label: 'Haid', active: 'bg-rose-700 text-white' },
                                { code: 'A', label: 'Alpha', active: 'bg-red-700 text-white' },
                              ] as const
                            ).map((opt) => (
                              <button
                                key={opt.code}
                                type="button"
                                onClick={() => setStudentDaily(st.id, opt.code)}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                                  current === opt.code
                                    ? opt.active
                                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={noteVal}
                            onChange={(e) => setStudentDailyNotes(st.id, e.target.value)}
                            placeholder="Opsional (mis. izin acara / sakit demam)"
                            className="w-full min-w-[200px] px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-600"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: MONTHLY MATRIX (1–31) */}
      {mode === 'monthly' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <span>
              Matriks <strong className="text-slate-900">{subject}</strong> · Waktu <strong className="text-slate-900">{sessionType}</strong> · Klik sel tanggal untuk mengubah status (Kosong → H → S → I → HD → A)
            </span>
            <span className="font-mono">
              H = Hadir · S = Sakit · I = Izin · HD = Haid · A = Alpha
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                  <th className="py-2.5 px-3 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[180px]">
                    Nama Santri
                  </th>
                  {Array.from({ length: daysInMonth }, (_, i) => (
                    <th key={i + 1} className="py-2 px-1 text-center font-mono tabular-nums min-w-[28px]">
                      {i + 1}
                    </th>
                  ))}
                  <th className="py-2 px-2 text-right font-mono border-l border-slate-200 text-emerald-700">H</th>
                  <th className="py-2 px-2 text-right font-mono text-amber-700">S</th>
                  <th className="py-2 px-2 text-right font-mono text-sky-700">I</th>
                  <th className="py-2 px-2 text-right font-mono text-rose-700">HD</th>
                  <th className="py-2 px-2 text-right font-mono text-red-700">A</th>
                  <th className="py-2 px-2.5 text-right font-mono">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={daysInMonth + 7} className="py-10 text-center text-slate-500">
                      Memuat matriks bulanan {subject} ({sessionType})...
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={daysInMonth + 7} className="py-10 text-center text-slate-500">
                      Tidak ada santri aktif untuk ditampilkan.
                    </td>
                  </tr>
                ) : (
                  students.map((st) => {
                    let h = 0, s = 0, iz = 0, hd = 0, a = 0;
                    const cells: React.ReactNode[] = [];
                    for (let d = 1; d <= daysInMonth; d++) {
                      const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                      const rec = monthlyMap.get(`${st.id}-${dateStr}`);
                      const status = rec?.status || '';
                      if (status === 'H') h++;
                      else if (status === 'S') s++;
                      else if (status === 'I') iz++;
                      else if (status === 'HD') hd++;
                      else if (status === 'A') a++;

                      const cellStyle =
                        status === 'H'
                          ? 'bg-emerald-50 text-emerald-800 font-semibold'
                          : status === 'S'
                            ? 'bg-amber-50 text-amber-800 font-semibold'
                            : status === 'I'
                              ? 'bg-sky-50 text-sky-800 font-semibold'
                              : status === 'HD'
                                ? 'bg-rose-50 text-rose-800 font-semibold'
                                : status === 'A'
                                  ? 'bg-red-50 text-red-800 font-semibold'
                                  : 'text-slate-300 hover:bg-slate-100';

                      cells.push(
                        <td key={d} className="p-0.5 text-center">
                          <button
                            type="button"
                            onClick={() => cycleCell(st, d)}
                            title={`${st.full_name} · ${dateStr} (${subject} - ${sessionType})`}
                            className={`w-6 h-6 rounded text-[11px] font-mono transition-colors cursor-pointer ${cellStyle}`}
                          >
                            {status || '·'}
                          </button>
                        </td>
                      );
                    }
                    const total = h + s + iz + hd + a;
                    const rate = total > 0 ? ((h / total) * 100).toFixed(0) : '0';

                    return (
                      <tr key={st.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 sticky left-0 bg-white border-r border-slate-200 z-10">
                          <p className="font-medium text-slate-900 truncate max-w-[175px]">{st.full_name}</p>
                          <p className="text-[10px] font-mono text-slate-400">{st.nis}</p>
                        </td>
                        {cells}
                        <td className="py-2 px-2 text-right font-mono tabular-nums border-l border-slate-200 text-emerald-700 font-semibold">
                          {h}
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-amber-700">{s}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-sky-700">{iz}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-rose-700">{hd}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-red-700">{a}</td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums font-semibold text-slate-800">
                          {rate}%
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3 & 4: REKAP ABSENSI HARIAN & BULANAN */}
      {isRecapMode && (
        <div className="space-y-4">
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <p className="text-[11px] font-medium text-slate-500">Hadir (H)</p>
              <p className="mt-1 font-mono text-lg font-bold text-emerald-700 tabular-nums">
                {recapSummary.hadir}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <p className="text-[11px] font-medium text-slate-500">Sakit (S)</p>
              <p className="mt-1 font-mono text-lg font-bold text-amber-700 tabular-nums">
                {recapSummary.sakit}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <p className="text-[11px] font-medium text-slate-500">Izin (I)</p>
              <p className="mt-1 font-mono text-lg font-bold text-sky-700 tabular-nums">
                {recapSummary.izin}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <p className="text-[11px] font-medium text-slate-500">Haid (HD)</p>
              <p className="mt-1 font-mono text-lg font-bold text-rose-700 tabular-nums">
                {recapSummary.haid}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <p className="text-[11px] font-medium text-slate-500">Alpha (A)</p>
              <p className="mt-1 font-mono text-lg font-bold text-red-700 tabular-nums">
                {recapSummary.alpha}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <p className="text-[11px] font-medium text-slate-500">Rata-rata Hadir</p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                {recapSummary.attendance_rate.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Recap Data Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {mode === 'recap_daily'
                    ? `Rekap Absensi Harian — ${selectedDate}`
                    : `Rekap Absensi Bulanan — ${selectedMonth}`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {recapExportOptions.subjectLabel} · {recapExportOptions.teacherLabel} · {recapExportOptions.sessionLabel}
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={recapSearch}
                  onChange={(e) => setRecapSearch(e.target.value)}
                  placeholder="Cari nama / NIS santri..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                    <th className="py-2.5 px-3 text-center w-10">No</th>
                    <th className="py-2.5 px-3">NIS</th>
                    <th className="py-2.5 px-3">Nama Santri</th>
                    <th className="py-2.5 px-2 text-center">L/P</th>
                    {mode === 'recap_daily' &&
                      ATTENDANCE_SESSIONS.map((sess) => (
                        <th key={sess} className="py-2.5 px-2.5 text-center">
                          {sess}
                        </th>
                      ))}
                    <th className="py-2.5 px-2.5 text-right font-mono text-emerald-700">H</th>
                    <th className="py-2.5 px-2.5 text-right font-mono text-amber-700">S</th>
                    <th className="py-2.5 px-2.5 text-right font-mono text-sky-700">I</th>
                    <th className="py-2.5 px-2.5 text-right font-mono text-rose-700">HD</th>
                    <th className="py-2.5 px-2.5 text-right font-mono text-red-700">A</th>
                    <th className="py-2.5 px-3 text-right font-mono">Total</th>
                    <th className="py-2.5 px-3 text-right font-mono">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loading ? (
                    <tr>
                      <td colSpan={mode === 'recap_daily' ? 16 : 11} className="py-10 text-center text-slate-500 text-xs">
                        Memuat rekap absensi...
                      </td>
                    </tr>
                  ) : filteredRecapRows.length === 0 ? (
                    <tr>
                      <td colSpan={mode === 'recap_daily' ? 16 : 11} className="py-10 text-center text-slate-500 text-xs">
                        Tidak ada santri yang sesuai dengan pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredRecapRows.map((row, idx) => (
                      <tr key={row.student_id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 text-center font-mono text-xs text-slate-500 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs text-slate-500 tabular-nums">
                          {row.nis}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900 text-xs">
                          {row.full_name}
                        </td>
                        <td className="py-2.5 px-2 text-center text-xs text-slate-600">
                          {row.gender}
                        </td>
                        {mode === 'recap_daily' &&
                          ATTENDANCE_SESSIONS.map((sess) => (
                            <td key={sess} className="py-2.5 px-2.5 text-center">
                              {renderStatusBadge(row.sessions[sess] || '')}
                            </td>
                          ))}
                        <td className="py-2.5 px-2.5 text-right font-mono text-xs tabular-nums text-emerald-700 font-semibold">
                          {row.hadir}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono text-xs tabular-nums text-amber-700">
                          {row.sakit}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono text-xs tabular-nums text-sky-700">
                          {row.izin}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono text-xs tabular-nums text-rose-700">
                          {row.haid}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono text-xs tabular-nums text-red-700">
                          {row.alpha}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-slate-700">
                          {row.total_sessions}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums font-semibold text-slate-900">
                          {row.attendance_rate.toFixed(1)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* RESET ATTENDANCE MODAL */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Reset Data Absensi
              </h3>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                disabled={resetting}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600">
                Pilih cakupan absensi yang ingin dikosongkan / direset ulang:
              </p>

              {mode === 'daily' ? (
                <>
                  <button
                    type="button"
                    disabled={resetting}
                    onClick={() => handleResetAttendance('daily_session')}
                    className="w-full text-left p-3.5 rounded-lg border border-slate-200 hover:border-amber-300 hover:bg-amber-50/50 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <p className="text-xs font-semibold text-slate-900">
                      Reset Waktu Ini Saja ({subject} · {sessionType} · {selectedDate})
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Mengosongkan isian &amp; data tersimpan khusus waktu {sessionType} pada mata pelajaran ini.
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={resetting}
                    onClick={() => handleResetAttendance('daily_all')}
                    className="w-full text-left p-3.5 rounded-lg border border-slate-200 hover:border-amber-300 hover:bg-amber-50/50 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <p className="text-xs font-semibold text-slate-900">
                      Reset Semua Waktu Hari Ini ({subject} · {selectedDate})
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Menghapus catatan Subuh, Zuhur, Asar, Magrib, dan Isya tanggal {selectedDate} pada mata pelajaran ini.
                    </p>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={resetting}
                  onClick={() => handleResetAttendance('monthly_session')}
                  className="w-full text-left p-3.5 rounded-lg border border-slate-200 hover:border-amber-300 hover:bg-amber-50/50 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <p className="text-xs font-semibold text-slate-900">
                    Reset Matriks Bulan Ini ({selectedMonth} · {subject} · {sessionType})
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Mengosongkan seluruh sel absensi bulan {selectedMonth} untuk waktu {sessionType}.
                  </p>
                </button>
              )}

              <button
                type="button"
                disabled={resetting}
                onClick={() => handleResetAttendance('all')}
                className="w-full text-left p-3.5 rounded-lg border border-red-200 bg-red-50/40 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-60"
              >
                <p className="text-xs font-semibold text-red-700">
                  Reset Ulang Semua Absensi Dari Awal (Semua Tanggal &amp; Waktu)
                </p>
                <p className="text-[11px] text-red-600/90 mt-0.5">
                  Menghapus permanen seluruh riwayat absensi untuk memulai pencatatan dari awal.
                </p>
              </button>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                disabled={resetting}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
