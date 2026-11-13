import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  exportMemorizationExcel,
  exportMemorizationPdf,
  exportMonthlyAttendanceExcel,
  exportMonthlyAttendancePdf,
  exportRecapExcel,
  exportRecapPdf,
  exportStudentsExcel,
} from '../lib/exportReports';
import {
  ATTENDANCE_CLASSES,
  ATTENDANCE_SESSIONS,
  ATTENDANCE_SUBJECTS,
  ATTENDANCE_TEACHERS,
  type AttendanceRecord,
  type ClassItem,
  type InstitutionSettings,
  type MemorizationLog,
  type Student,
  type StudentRecap,
} from '../types';

interface RecapReportsViewProps {
  settings: InstitutionSettings;
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function RecapReportsView({ settings }: RecapReportsViewProps) {
  const [periodMode, setPeriodMode] = useState<'monthly' | 'daily'>('monthly');
  const [date, setDate] = useState(getTodayStr());
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [classLabel, setClassLabel] = useState('all');
  const [subject, setSubject] = useState('all');
  const [teacherName, setTeacherName] = useState('all');
  const [sessionType, setSessionType] = useState('all');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [recap, setRecap] = useState<StudentRecap[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<{ classes: ClassItem[] }>('/api/classes')
      .then((res) => setClasses(res.classes))
      .catch(() => {});
  }, []);

  const classOptions = useMemo(() => {
    const set = new Set<string>([...ATTENDANCE_CLASSES]);
    for (const c of classes) {
      if (c.name) set.add(c.name);
    }
    return Array.from(set);
  }, [classes]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (periodMode === 'daily') {
          params.set('date', date || getTodayStr());
        } else {
          params.set('month', month || 'all');
        }
        params.set('classLabel', classLabel);
        params.set('subject', subject);
        params.set('teacherName', teacherName);
        params.set('sessionType', sessionType);
        const res = await apiRequest<{ recap: StudentRecap[] }>(`/api/recap?${params.toString()}`);
        if (!cancelled) setRecap(res.recap);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat rekap.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [periodMode, date, month, classLabel, subject, teacherName, sessionType]);

  const activePeriod = periodMode === 'daily' ? date : (month || 'all');
  const sessionLabel = sessionType === 'all' ? 'Semua Waktu (Subuh–Isya)' : sessionType;
  const classNameLabel = classLabel === 'all' ? 'Semua Kelas' : classLabel;
  const subjectLabel = subject === 'all' ? 'Semua Mata Pelajaran' : subject;
  const teacherLabel = teacherName === 'all' ? 'Semua Guru Pengampu' : teacherName;

  const totals = useMemo(() => {
    let h = 0, s = 0, i = 0, hd = 0, a = 0, hafCount = 0, hafAyat = 0, murCount = 0, murAyat = 0;
    for (const r of recap) {
      h += r.hadir;
      s += r.sakit;
      i += r.izin;
      hd += r.haid;
      a += r.alpha;
      hafCount += r.hafalan_count;
      hafAyat += r.hafalan_ayat;
      murCount += r.murojaah_count;
      murAyat += r.murojaah_ayat;
    }
    const totalAtt = h + s + i + hd + a;
    const avgRate = totalAtt > 0 ? ((h / totalAtt) * 100).toFixed(1) : '0.0';
    return { h, s, i, hd, a, avgRate, hafCount, hafAyat, murCount, murAyat };
  }, [recap]);

  async function handleExportMonthlyMatrix(format: 'pdf' | 'excel') {
    const targetMonth = month || new Date().toISOString().slice(0, 7);
    const matrixSession = sessionType === 'all' ? 'Subuh' : sessionType;
    setExportBusy(`matrix-${format}`);
    try {
      const attParams = new URLSearchParams({
        month: targetMonth,
        classLabel,
        subject,
        teacherName,
        sessionType: matrixSession,
      });
      const [stuRes, attRes] = await Promise.all([
        apiRequest<{ students: Student[] }>('/api/students?status=Aktif'),
        apiRequest<{ records: AttendanceRecord[] }>(`/api/attendance?${attParams.toString()}`),
      ]);
      const extraMeta = { subjectLabel, teacherLabel };
      if (format === 'pdf') {
        exportMonthlyAttendancePdf(stuRes.students, attRes.records, targetMonth, settings, classNameLabel, matrixSession, extraMeta);
      } else {
        exportMonthlyAttendanceExcel(stuRes.students, attRes.records, targetMonth, classNameLabel, matrixSession, extraMeta);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengekspor matriks.');
    } finally {
      setExportBusy('');
    }
  }

  async function handleExportMemorization(format: 'pdf' | 'excel') {
    setExportBusy(`memo-${format}`);
    try {
      const params = new URLSearchParams();
      if (periodMode === 'monthly' && month) params.set('month', month);
      const res = await apiRequest<{ logs: MemorizationLog[] }>(`/api/memorization?${params.toString()}`);
      const logs = periodMode === 'daily' ? res.logs.filter((l) => l.date === date) : res.logs;
      if (format === 'pdf') {
        exportMemorizationPdf(
          logs,
          settings,
          'LAPORAN SETORAN HAFALAN & MUROJAAH',
          `Periode: ${activePeriod} · Kelas: ${classNameLabel}`
        );
      } else {
        exportMemorizationExcel(logs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengekspor setoran hafalan.');
    } finally {
      setExportBusy('');
    }
  }

  async function handleExportMasterStudents() {
    setExportBusy('students-excel');
    try {
      const res = await apiRequest<{ students: Student[] }>('/api/students');
      exportStudentsExcel(res.students);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengekspor data santri.');
    } finally {
      setExportBusy('');
    }
  }

  return (
    <div className="space-y-6">
      {/* Filter & Export Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Pusat Laporan PDF &amp; Excel
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pilih mode Harian atau Bulanan serta kelas, mata pelajaran, guru pengampu, dan waktu pelajaran untuk mengunduh laporan resmi.
            </p>
          </div>
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start shrink-0">
            <button
              type="button"
              onClick={() => setPeriodMode('daily')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                periodMode === 'daily' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rekap Harian
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('monthly')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                periodMode === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rekap Bulanan
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {periodMode === 'daily' ? 'Tanggal' : 'Bulan'}
            </label>
            {periodMode === 'daily' ? (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white text-slate-800"
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white text-slate-800"
                />
                {month && (
                  <button
                    type="button"
                    onClick={() => setMonth('')}
                    className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                  >
                    Semua
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Kelas
            </label>
            <select
              value={classLabel}
              onChange={(e) => setClassLabel(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
            >
              <option value="all">Semua Kelas</option>
              {classOptions.map((cName) => (
                <option key={cName} value={cName}>
                  {cName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Mata Pelajaran
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
            >
              <option value="all">Semua Mata Pelajaran</option>
              {ATTENDANCE_SUBJECTS.map((subj) => (
                <option key={subj} value={subj}>
                  {subj}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Guru Pengampu
            </label>
            <select
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
            >
              <option value="all">Semua Guru Pengampu</option>
              {ATTENDANCE_TEACHERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Waktu Pelajaran
            </label>
            <select
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
            >
              <option value="all">Semua Waktu (5 Sesi)</option>
              {ATTENDANCE_SESSIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Report Export Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 pt-4 border-t border-slate-200">
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-900">Rekap Kehadiran &amp; Hafalan</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Ringkasan H/S/I/HD/A, %, setoran baru &amp; murojaah per santri.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  exportRecapPdf(recap, settings, activePeriod, classNameLabel, sessionLabel, {
                    subjectLabel,
                    teacherLabel,
                  })
                }
                className="flex-1 py-1.5 px-2.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-red-700" />
                <span>PDF</span>
              </button>
              <button
                onClick={() =>
                  exportRecapExcel(recap, settings, activePeriod, classNameLabel, sessionLabel, {
                    subjectLabel,
                    teacherLabel,
                  })
                }
                className="flex-1 py-1.5 px-2.5 rounded-md bg-emerald-800 hover:bg-emerald-900 text-xs font-semibold text-white flex items-center justify-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-900">Matriks Absensi Bulanan</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Tabel harian tanggal 1–31 per santri dalam satu lembar.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={!!exportBusy}
                onClick={() => handleExportMonthlyMatrix('pdf')}
                className="flex-1 py-1.5 px-2.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-red-700" />
                <span>PDF</span>
              </button>
              <button
                disabled={!!exportBusy}
                onClick={() => handleExportMonthlyMatrix('excel')}
                className="flex-1 py-1.5 px-2.5 rounded-md bg-emerald-800 hover:bg-emerald-900 text-xs font-semibold text-white flex items-center justify-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-900">Log Hafalan &amp; Murojaah</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Daftar rinci surah, ayat, predikat, dan catatan ustaz.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={!!exportBusy}
                onClick={() => handleExportMemorization('pdf')}
                className="flex-1 py-1.5 px-2.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-red-700" />
                <span>PDF</span>
              </button>
              <button
                disabled={!!exportBusy}
                onClick={() => handleExportMemorization('excel')}
                className="flex-1 py-1.5 px-2.5 rounded-md bg-emerald-800 hover:bg-emerald-900 text-xs font-semibold text-white flex items-center justify-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-900">Data Induk Santri Lengkap</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Ekspor seluruh biodata santri, wali, alamat, dan target juz.</p>
            </div>
            <button
              disabled={!!exportBusy}
              onClick={handleExportMasterStudents}
              className="w-full py-1.5 px-2.5 rounded-md bg-slate-800 hover:bg-slate-900 text-xs font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Excel Induk Santri</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Rata-rata Kehadiran</p>
          <p className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">{totals.avgRate}%</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Kehadiran (H / S / I / HD / A)</p>
          <p className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
            {totals.h} / {totals.s} / {totals.i} / {totals.hd} / {totals.a}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Setoran Hafalan Baru</p>
          <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {totals.hafCount}x <span className="text-xs font-normal text-slate-500">({totals.hafAyat} ayat)</span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Murojaah</p>
          <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {totals.murCount}x <span className="text-xs font-normal text-slate-500">({totals.murAyat} ayat)</span>
          </p>
        </div>
      </div>

      {/* Recap Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Rekap Kehadiran &amp; Pencapaian Setiap Santri ({recap.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">NIS</th>
                <th className="py-2.5 px-4">Nama Santri</th>
                <th className="py-2.5 px-4">Kelas</th>
                <th className="py-2.5 px-3 text-right">H</th>
                <th className="py-2.5 px-3 text-right">S</th>
                <th className="py-2.5 px-3 text-right">I</th>
                <th className="py-2.5 px-3 text-right">HD</th>
                <th className="py-2.5 px-3 text-right">A</th>
                <th className="py-2.5 px-4 text-right">Kehadiran</th>
                <th className="py-2.5 px-4 text-right">Setoran Baru</th>
                <th className="py-2.5 px-4 text-right">Murojaah</th>
                <th className="py-2.5 px-4">Hafalan Terakhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-10 text-center text-slate-500">
                    Menghitung rekapitulasi...
                  </td>
                </tr>
              ) : recap.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-10 text-center text-slate-500">
                    Tidak ada data santri untuk ditampilkan.
                  </td>
                </tr>
              ) : (
                recap.map((r) => (
                  <tr key={r.student_id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-slate-500 tabular-nums">{r.nis}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{r.full_name}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{r.class_name}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-emerald-700 font-semibold">{r.hadir}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-amber-700">{r.sakit}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-sky-700">{r.izin}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-rose-700">{r.haid}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-red-700">{r.alpha}</td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums font-semibold text-slate-900">
                      {r.attendance_rate.toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                      {r.hafalan_count}x ({r.hafalan_ayat} ayat)
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                      {r.murojaah_count}x ({r.murojaah_ayat} ayat)
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {r.last_surah ? `${r.last_surah} (${r.last_ayat})` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
