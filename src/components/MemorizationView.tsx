import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { QURAN_SURAHS } from '../data/surahs';
import { apiRequest } from '../lib/api';
import { exportMemorizationExcel, exportMemorizationPdf } from '../lib/exportReports';
import { SearchableStudentSelect } from './SearchableStudentSelect';
import type {
  ClassItem,
  InstitutionSettings,
  MemorizationLog,
  MemorizationType,
  QualityGrade,
  Student,
} from '../types';

interface MemorizationViewProps {
  settings: InstitutionSettings;
}

const QUALITY_OPTIONS: QualityGrade[] = ['Mumtaz', 'Jayyid Jiddan', 'Jayyid', 'Maqbul', 'Mengulang'];

export function MemorizationView({ settings }: MemorizationViewProps) {
  const [tab, setTab] = useState<'all' | MemorizationType>('hafalan');
  const [logs, setLogs] = useState<MemorizationLog[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Filters
  const [filterClass, setFilterClass] = useState('all');
  const [filterStudent, setFilterStudent] = useState('all');
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState('');

  // Modal Form
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<MemorizationLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTargetLog, setDeleteTargetLog] = useState<MemorizationLog | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    student_id: '',
    type: 'hafalan' as MemorizationType,
    date: new Date().toISOString().slice(0, 10),
    surah_number: 78,
    juz: 30,
    ayat_start: 1,
    ayat_end: 10,
    quality: 'Jayyid Jiddan' as QualityGrade,
    murojaah_category: 'Harian',
    notes: '',
  });

  async function loadMeta() {
    const [clsRes, stuRes] = await Promise.all([
      apiRequest<{ classes: ClassItem[] }>('/api/classes'),
      apiRequest<{ students: Student[] }>('/api/students'),
    ]);
    setClasses(clsRes.classes);
    setStudents(stuRes.students);
  }

  async function loadLogs() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (tab !== 'all') params.set('type', tab);
      if (filterClass !== 'all') params.set('classId', filterClass);
      if (filterStudent !== 'all') params.set('studentId', filterStudent);
      if (filterMonth) params.set('month', filterMonth);
      if (search.trim()) params.set('search', search.trim());

      const res = await apiRequest<{ logs: MemorizationLog[] }>(`/api/memorization?${params.toString()}`);
      setLogs(res.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat catatan hafalan.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [tab, filterClass, filterStudent, filterMonth, search]);

  const selectedSurah = useMemo(
    () => QURAN_SURAHS.find((s) => s.number === Number(form.surah_number)) || QURAN_SURAHS[0],
    [form.surah_number]
  );

  function handleSurahChange(num: number) {
    const surah = QURAN_SURAHS.find((s) => s.number === num);
    if (!surah) return;
    setForm((prev) => ({
      ...prev,
      surah_number: num,
      juz: surah.juzStart,
      ayat_start: 1,
      ayat_end: Math.min(15, surah.ayatCount),
    }));
  }

  function openAddModal(defaultType: MemorizationType) {
    setEditingLog(null);
    const firstActive = students.find((s) => s.status === 'Aktif') || students[0];
    setForm({
      student_id: firstActive ? String(firstActive.id) : '',
      type: defaultType,
      date: new Date().toISOString().slice(0, 10),
      surah_number: 78,
      juz: 30,
      ayat_start: 1,
      ayat_end: 20,
      quality: 'Jayyid Jiddan',
      murojaah_category: 'Harian',
      notes: '',
    });
    setModalOpen(true);
  }

  function openEditModal(log: MemorizationLog) {
    setEditingLog(log);
    setForm({
      student_id: String(log.student_id),
      type: log.type,
      date: log.date,
      surah_number: log.surah_number,
      juz: log.juz,
      ayat_start: log.ayat_start,
      ayat_end: log.ayat_end,
      quality: log.quality,
      murojaah_category: log.murojaah_category || 'Harian',
      notes: log.notes || '',
    });
    setModalOpen(true);
  }

  async function saveLog(e: React.FormEvent) {
    e.preventDefault();
    if (!form.student_id) {
      setError('Pilih santri terlebih dahulu.');
      return;
    }
    if (form.ayat_end < form.ayat_start || form.ayat_end > selectedSurah.ayatCount) {
      setError(`Rentang ayat untuk Surah ${selectedSurah.name} harus antara 1 s.d. ${selectedSurah.ayatCount}.`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        student_id: Number(form.student_id),
        type: form.type,
        date: form.date,
        juz: Number(form.juz),
        surah_number: selectedSurah.number,
        surah_name: selectedSurah.name,
        ayat_start: Number(form.ayat_start),
        ayat_end: Number(form.ayat_end),
        quality: form.quality,
        murojaah_category: form.type === 'murojaah' ? form.murojaah_category : '',
        notes: form.notes,
      };
      if (editingLog) {
        await apiRequest(`/api/memorization/${editingLog.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/memorization', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      await loadLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan catatan.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteLog() {
    if (!deleteTargetLog) return;
    setDeleting(true);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/memorization/${deleteTargetLog.id}`, { method: 'DELETE' });
      setDeleteTargetLog(null);
      setNotice('Catatan hafalan/murojaah berhasil dihapus.');
      await loadLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus catatan.');
      setDeleteTargetLog(null);
    } finally {
      setDeleting(false);
    }
  }

  async function confirmResetAllMemorization() {
    setDeleting(true);
    setError('');
    setNotice('');
    try {
      const res = await apiRequest<{ ok: boolean; deleted: number }>('/api/memorization/reset', {
        method: 'POST',
      });
      setResetModalOpen(false);
      setNotice(`Seluruh catatan setoran hafalan & murojaah (${res.deleted} entri) telah direset.`);
      await loadLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mereset catatan hafalan.');
      setResetModalOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  const totalAyatDisplayed = useMemo(() => logs.reduce((acc, l) => acc + l.total_ayat, 0), [logs]);

  return (
    <div className="space-y-5">
      {/* Top Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          <button
            onClick={() => setTab('hafalan')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'hafalan' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Setoran Hafalan Baru
          </button>
          <button
            onClick={() => setTab('murojaah')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'murojaah' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Catatan Murojaah
          </button>
          <button
            onClick={() => setTab('all')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua Catatan
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setResetModalOpen(true)}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Hafalan</span>
          </button>
          <button
            onClick={() =>
              exportMemorizationPdf(
                logs,
                settings,
                tab === 'murojaah'
                  ? 'LAPORAN CATATAN MUROJAAH SANTRI'
                  : tab === 'hafalan'
                    ? 'LAPORAN SETORAN HAFALAN BARU SANTRI'
                    : 'LAPORAN MUTABA’AH HAFALAN & MUROJAAH',
                `Periode: ${filterMonth || 'Semua'} · Total Catatan: ${logs.length} (${totalAyatDisplayed} ayat)`
              )
            }
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-red-700" />
            <span>Ekspor PDF</span>
          </button>
          <button
            onClick={() => exportMemorizationExcel(logs)}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>Ekspor Excel</span>
          </button>
          <button
            onClick={() => openAddModal(tab === 'murojaah' ? 'murojaah' : 'hafalan')}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{tab === 'murojaah' ? 'Catat Murojaah' : 'Catat Setoran'}</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-xs font-medium underline cursor-pointer">
            Tutup
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs font-medium underline cursor-pointer">
            Tutup
          </button>
        </div>
      )}

      {/* Filter Bar + Summary */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari santri, surah, atau catatan..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
          <select
            value={filterClass}
            onChange={(e) => {
              setFilterClass(e.target.value);
              setFilterStudent('all');
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="all">Semua Kelas / Halaqah</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={filterStudent}
            onChange={(e) => setFilterStudent(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="all">Semua Santri</option>
            {students
              .filter((s) => filterClass === 'all' || String(s.class_id) === filterClass)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.nis})
                </option>
              ))}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="flex-1 px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white text-slate-800"
            />
            {filterMonth && (
              <button
                onClick={() => setFilterMonth('')}
                className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Semua
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span>Menampilkan {logs.length} catatan</span>
          <span className="font-mono tabular-nums font-medium text-slate-800">
            Total Akumulasi: {totalAyatDisplayed} ayat
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Tanggal</th>
                <th className="py-2.5 px-4">Santri &amp; Kelas</th>
                <th className="py-2.5 px-4">Jenis</th>
                <th className="py-2.5 px-4">Surah &amp; Ayat</th>
                <th className="py-2.5 px-4 text-right">Jml Ayat</th>
                <th className="py-2.5 px-4">Predikat</th>
                <th className="py-2.5 px-4">Catatan &amp; Pengampu</th>
                <th className="py-2.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    Memuat catatan...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <p className="font-medium text-slate-700">Belum ada catatan pada periode ini.</p>
                    <button
                      onClick={() => openAddModal(tab === 'murojaah' ? 'murojaah' : 'hafalan')}
                      className="mt-3 px-3.5 py-1.5 rounded-lg bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      Input Catatan Pertama
                    </button>
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {l.date}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{l.student_name}</p>
                      <p className="text-xs text-slate-500">{l.class_name}</p>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span className={l.type === 'hafalan' ? 'font-semibold text-emerald-800' : 'font-semibold text-sky-800'}>
                        {l.type === 'hafalan' ? 'Setoran Baru' : 'Murojaah'}
                      </span>
                      {l.murojaah_category && (
                        <p className="text-[11px] text-slate-500">{l.murojaah_category}</p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">
                        {l.surah_number}. {l.surah_name}
                      </p>
                      <p className="text-xs font-mono text-slate-500 tabular-nums">
                        Juz {l.juz} · Ayat {l.ayat_start}–{l.ayat_end}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-800">
                      {l.total_ayat}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold">
                      <span
                        className={
                          l.quality === 'Mengulang'
                            ? 'text-red-700'
                            : l.quality === 'Mumtaz'
                              ? 'text-emerald-700'
                              : l.quality === 'Maqbul'
                                ? 'text-amber-700'
                                : 'text-slate-700'
                        }
                      >
                        {l.quality}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs max-w-xs">
                      <p className="text-slate-700 truncate">{l.notes || '-'}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{l.ustaz_name || '-'}</p>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(l)}
                          title="Edit Catatan"
                          className="p-1.5 rounded-md hover:bg-slate-200/70 text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTargetLog(l)}
                          title="Hapus Catatan"
                          className="p-1.5 rounded-md hover:bg-red-100 text-slate-500 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-slate-900">
                {editingLog ? 'Edit Catatan Hafalan / Murojaah' : 'Catat Setoran Hafalan / Murojaah'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={saveLog} className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Pilih Santri *</label>
                  <SearchableStudentSelect
                    required
                    students={students}
                    value={form.student_id}
                    onChange={(val) => setForm({ ...form, student_id: val })}
                    placeholder="Ketik nama atau NIS santri..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Setoran *</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as MemorizationType })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="hafalan">Setoran Hafalan Baru (Ziyadah)</option>
                    <option value="murojaah">Catatan Murojaah (Ulangan)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal *</label>
                  <input
                    required
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Surah Al-Qur&apos;an * (Total {selectedSurah.ayatCount} Ayat)
                  </label>
                  <select
                    value={form.surah_number}
                    onChange={(e) => handleSurahChange(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {QURAN_SURAHS.map((s) => (
                      <option key={s.number} value={s.number}>
                        {s.number}. {s.name} ({s.arabic}) · {s.ayatCount} ayat
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Juz (1–30)</label>
                  <input
                    required
                    type="number"
                    min={1}
                    max={30}
                    value={form.juz}
                    onChange={(e) => setForm({ ...form, juz: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Ayat Mulai</label>
                    <input
                      required
                      type="number"
                      min={1}
                      max={selectedSurah.ayatCount}
                      value={form.ayat_start}
                      onChange={(e) => setForm({ ...form, ayat_start: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Ayat Akhir</label>
                    <input
                      required
                      type="number"
                      min={form.ayat_start}
                      max={selectedSurah.ayatCount}
                      value={form.ayat_end}
                      onChange={(e) => setForm({ ...form, ayat_end: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Predikat / Nilai</label>
                  <select
                    value={form.quality}
                    onChange={(e) => setForm({ ...form, quality: e.target.value as QualityGrade })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {QUALITY_OPTIONS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>

                {form.type === 'murojaah' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Kategori Murojaah</label>
                    <select
                      value={form.murojaah_category}
                      onChange={(e) => setForm({ ...form, murojaah_category: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Harian">Murojaah Harian (Sabaq/Sabqi)</option>
                      <option value="Mingguan">Murojaah Mingguan (Manzil)</option>
                      <option value="Tasmi">Ujian Tasmi&apos; / Sambung Ayat</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Tajwid, Makhraj, &amp; Kelancaran
                </label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Contoh: Bacaan lancar, perhatikan dengung ikhfa dan panjang mad wajib."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  Jumlah disetor: {Math.max(0, form.ayat_end - form.ayat_start + 1)} ayat
                </span>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white disabled:opacity-60 cursor-pointer"
                  >
                    {saving ? 'Menyimpan...' : 'Simpan Catatan'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE LOG MODAL */}
      {deleteTargetLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">Hapus Catatan Hafalan</h3>
              <button
                type="button"
                onClick={() => setDeleteTargetLog(null)}
                disabled={deleting}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 text-sm text-slate-700">
              Hapus catatan <strong className="text-slate-900">{deleteTargetLog.surah_name}</strong> ({deleteTargetLog.ayat_start}–{deleteTargetLog.ayat_end}) milik{' '}
              <strong className="text-slate-900">{deleteTargetLog.student_name}</strong>?
            </div>
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTargetLog(null)}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteLog}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-700 hover:bg-red-800 text-white disabled:opacity-60 cursor-pointer"
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESET ALL MEMORIZATION MODAL */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">Reset Setoran Hafalan &amp; Murojaah</h3>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                disabled={deleting}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm text-slate-700">
              <p>Apakah Anda yakin ingin mengosongkan seluruh catatan setoran hafalan baru dan murojaah dari awal?</p>
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                Semua riwayat hafalan &amp; murojaah akan dihapus permanen. Data santri dan absensi tidak ikut terhapus.
              </p>
            </div>
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmResetAllMemorization}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-700 hover:bg-red-800 text-white disabled:opacity-60 cursor-pointer"
              >
                {deleting ? 'Mereset...' : 'Ya, Reset Semua'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
