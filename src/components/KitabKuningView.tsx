import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { exportKitabKuningExcel, exportKitabKuningPdf } from '../lib/exportReports';
import { SearchableStudentSelect } from './SearchableStudentSelect';
import type {
  ClassItem,
  InstitutionSettings,
  KitabKuningLog,
  KitabMethod,
  QualityGrade,
  Student,
} from '../types';

interface KitabKuningViewProps {
  settings: InstitutionSettings;
}

const PRESET_KITAB: Array<{ name: string; fan: string }> = [
  { name: 'Safinatun Najah', fan: 'Fiqih' },
  { name: 'Fathul Qarib (Taqrib)', fan: 'Fiqih' },
  { name: 'Kifayatul Akhyar', fan: 'Fiqih' },
  { name: 'Aqidatul Awam', fan: 'Aqidah' },
  { name: 'Tijan Ad-Darari', fan: 'Aqidah' },
  { name: 'Al-Jurumiyah', fan: 'Nahwu' },
  { name: 'Imrithi', fan: 'Nahwu' },
  { name: 'Alfiyah Ibnu Malik', fan: 'Nahwu' },
  { name: 'Amtsilah Tashrifiyah', fan: 'Shorof' },
  { name: "Ta'lim Muta'allim", fan: 'Akhlak / Tasawuf' },
  { name: 'Akhlaqul Banin / Banat', fan: 'Akhlak / Tasawuf' },
  { name: 'Nashaihul Ibad', fan: 'Akhlak / Tasawuf' },
  { name: "Arba'in Nawawi", fan: 'Hadits' },
  { name: 'Riyadhush Shalihin', fan: 'Hadits' },
  { name: 'Bulughul Maram', fan: 'Hadits' },
  { name: 'Tafsir Jalalain', fan: 'Tafsir' },
  { name: 'Tuhfatul Athfal / Jazariyah', fan: 'Tajwid' },
];

const FAN_OPTIONS = [
  'Fiqih',
  'Aqidah',
  'Nahwu',
  'Shorof',
  'Akhlak / Tasawuf',
  'Hadits',
  'Tafsir',
  'Tajwid',
  'Lainnya',
];

const METHOD_OPTIONS: KitabMethod[] = [
  'Bandongan',
  'Sorogan',
  'Hafalan Nadhom',
  'Praktik Baca Kitab',
];

const GRADE_OPTIONS: QualityGrade[] = ['Mumtaz', 'Jayyid Jiddan', 'Jayyid', 'Maqbul', 'Mengulang'];

export function KitabKuningView({ settings }: KitabKuningViewProps) {
  const [logs, setLogs] = useState<KitabKuningLog[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Filters
  const [filterClass, setFilterClass] = useState('all');
  const [filterStudent, setFilterStudent] = useState('all');
  const [filterFan, setFilterFan] = useState('all');
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState('');

  // Add / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<KitabKuningLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    student_id: '',
    apply_to_all_active: false,
    date: new Date().toISOString().slice(0, 10),
    kitab_name: 'Safinatun Najah',
    fan_ilmu: 'Fiqih',
    method: 'Bandongan' as KitabMethod,
    chapter_or_bab: '',
    grade: 'Jayyid Jiddan' as QualityGrade,
    notes: '',
  });

  // Delete / Reset Confirmation Modals
  const [deleteTarget, setDeleteTarget] = useState<KitabKuningLog | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      if (filterClass !== 'all') params.set('classId', filterClass);
      if (filterStudent !== 'all') params.set('studentId', filterStudent);
      if (filterFan !== 'all') params.set('fan', filterFan);
      if (filterMonth) params.set('month', filterMonth);
      if (search.trim()) params.set('search', search.trim());

      const res = await apiRequest<{ logs: KitabKuningLog[] }>(`/api/kitab-kuning?${params.toString()}`);
      setLogs(res.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat catatan Kitab Kuning.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [filterClass, filterStudent, filterFan, filterMonth, search]);

  function openAddModal() {
    setEditingLog(null);
    const firstActive = students.find((s) => s.status === 'Aktif') || students[0];
    setForm({
      student_id: firstActive ? String(firstActive.id) : '',
      apply_to_all_active: false,
      date: new Date().toISOString().slice(0, 10),
      kitab_name: 'Safinatun Najah',
      fan_ilmu: 'Fiqih',
      method: 'Bandongan',
      chapter_or_bab: '',
      grade: 'Jayyid Jiddan',
      notes: '',
    });
    setModalOpen(true);
  }

  function openEditModal(log: KitabKuningLog) {
    setEditingLog(log);
    setForm({
      student_id: String(log.student_id),
      apply_to_all_active: false,
      date: log.date,
      kitab_name: log.kitab_name,
      fan_ilmu: log.fan_ilmu,
      method: log.method,
      chapter_or_bab: log.chapter_or_bab,
      grade: log.grade,
      notes: log.notes || '',
    });
    setModalOpen(true);
  }

  function handlePresetKitabSelect(kitabName: string) {
    const found = PRESET_KITAB.find((k) => k.name === kitabName);
    setForm((prev) => ({
      ...prev,
      kitab_name: kitabName,
      fan_ilmu: found ? found.fan : prev.fan_ilmu,
    }));
  }

  async function saveLog(e: React.FormEvent) {
    e.preventDefault();
    if (!form.apply_to_all_active && !form.student_id) {
      setError('Pilih santri atau centang catat untuk seluruh santri aktif.');
      return;
    }
    if (!form.kitab_name.trim()) {
      setError('Nama kitab wajib diisi.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editingLog) {
        await apiRequest(`/api/kitab-kuning/${editingLog.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            student_id: Number(form.student_id),
            date: form.date,
            kitab_name: form.kitab_name.trim(),
            fan_ilmu: form.fan_ilmu,
            method: form.method,
            chapter_or_bab: form.chapter_or_bab.trim(),
            grade: form.grade,
            notes: form.notes.trim(),
          }),
        });
        setNotice('Catatan pelajaran Kitab Kuning berhasil diperbarui.');
      } else {
        const res = await apiRequest<{ count: number }>('/api/kitab-kuning', {
          method: 'POST',
          body: JSON.stringify({
            student_id: form.apply_to_all_active ? undefined : Number(form.student_id),
            apply_to_all_active: form.apply_to_all_active,
            date: form.date,
            kitab_name: form.kitab_name.trim(),
            fan_ilmu: form.fan_ilmu,
            method: form.method,
            chapter_or_bab: form.chapter_or_bab.trim(),
            grade: form.grade,
            notes: form.notes.trim(),
          }),
        });
        setNotice(
          res.count > 1
            ? `Pelajaran Kitab Kuning "${form.kitab_name}" berhasil dicatat untuk ${res.count} santri aktif.`
            : `Pelajaran Kitab Kuning "${form.kitab_name}" berhasil disimpan.`
        );
      }
      setModalOpen(false);
      await loadLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan catatan Kitab Kuning.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/kitab-kuning/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      setNotice('Catatan pelajaran Kitab Kuning berhasil dihapus.');
      await loadLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus catatan.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  async function confirmResetAll() {
    setDeleting(true);
    setError('');
    setNotice('');
    try {
      const res = await apiRequest<{ ok: boolean; deleted: number }>('/api/kitab-kuning/reset', {
        method: 'POST',
      });
      setResetModalOpen(false);
      setNotice(`Seluruh catatan Kitab Kuning (${res.deleted} entri) telah direset.`);
      await loadLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mereset catatan Kitab Kuning.');
      setResetModalOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  const uniqueKitabCount = useMemo(() => new Set(logs.map((l) => l.kitab_name)).size, [logs]);

  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="text-xs text-slate-600">
          Catat kajian <strong className="text-slate-900">Bandongan</strong>,{' '}
          <strong className="text-slate-900">Sorogan</strong>,{' '}
          <strong className="text-slate-900">Hafalan Nadhom</strong>, dan{' '}
          <strong className="text-slate-900">Praktik Baca Kitab</strong> untuk santri.
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setResetModalOpen(true)}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Catatan</span>
          </button>
          <button
            onClick={() =>
              exportKitabKuningPdf(
                logs,
                settings,
                'LAPORAN PELAJARAN KITAB KUNING',
                `Periode: ${filterMonth || 'Semua'} · Bidang Ilmu: ${filterFan === 'all' ? 'Semua' : filterFan} · Total: ${logs.length} catatan`
              )
            }
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-red-700" />
            <span>Ekspor PDF</span>
          </button>
          <button
            onClick={() => exportKitabKuningExcel(logs)}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>Ekspor Excel</span>
          </button>
          <button
            onClick={openAddModal}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Catat Kitab Kuning</span>
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

      {/* Filter Bar & Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari santri, nama kitab, bab..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
          <select
            value={filterFan}
            onChange={(e) => setFilterFan(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="all">Semua Bidang Ilmu</option>
            {FAN_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
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
          <span>Menampilkan {logs.length} catatan pelajaran Kitab Kuning</span>
          <span className="font-mono tabular-nums font-medium text-slate-800">
            {uniqueKitabCount} Judul Kitab Tercatat
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Tanggal</th>
                <th className="py-2.5 px-4">Santri &amp; Kelas</th>
                <th className="py-2.5 px-4">Kitab &amp; Bidang Ilmu</th>
                <th className="py-2.5 px-4">Metode</th>
                <th className="py-2.5 px-4">Bab / Fasal / Hal</th>
                <th className="py-2.5 px-4">Predikat</th>
                <th className="py-2.5 px-4">Catatan &amp; Pengampu</th>
                <th className="py-2.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    Memuat catatan pelajaran Kitab Kuning...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <p className="font-medium text-slate-700">Belum ada catatan pelajaran Kitab Kuning pada periode ini.</p>
                    <button
                      onClick={openAddModal}
                      className="mt-3 px-3.5 py-1.5 rounded-lg bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      Input Catatan Kitab Kuning
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
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{l.kitab_name}</p>
                      <p className="text-xs text-emerald-800 font-medium">{l.fan_ilmu}</p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">{l.method}</td>
                    <td className="py-3 px-4 text-xs text-slate-700">{l.chapter_or_bab || '-'}</td>
                    <td className="py-3 px-4 text-xs font-semibold">
                      <span
                        className={
                          l.grade === 'Mengulang'
                            ? 'text-red-700'
                            : l.grade === 'Mumtaz'
                              ? 'text-emerald-700'
                              : l.grade === 'Maqbul'
                                ? 'text-amber-700'
                                : 'text-slate-700'
                        }
                      >
                        {l.grade}
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
                          onClick={() => setDeleteTarget(l)}
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
                {editingLog ? 'Edit Catatan Kitab Kuning' : 'Catat Pelajaran Kitab Kuning'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={saveLog} className="p-6 overflow-y-auto space-y-4">
              {!editingLog && (
                <label className="flex items-center gap-2.5 p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs font-medium text-emerald-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.apply_to_all_active}
                    onChange={(e) => setForm({ ...form, apply_to_all_active: e.target.checked })}
                    className="rounded border-emerald-400 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span>
                    Catat sekaligus untuk seluruh santri aktif (kajian klasikal / bandongan)
                  </span>
                </label>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {!form.apply_to_all_active && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Pilih Santri *</label>
                    <SearchableStudentSelect
                      required={!form.apply_to_all_active}
                      students={students}
                      value={form.student_id}
                      onChange={(val) => setForm({ ...form, student_id: val })}
                      placeholder="Ketik nama atau NIS santri..."
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Pilih Kitab Populer</label>
                  <select
                    value={PRESET_KITAB.some((k) => k.name === form.kitab_name) ? form.kitab_name : '__custom__'}
                    onChange={(e) => {
                      if (e.target.value !== '__custom__') {
                        handlePresetKitabSelect(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {PRESET_KITAB.map((k) => (
                      <option key={k.name} value={k.name}>
                        {k.name} ({k.fan})
                      </option>
                    ))}
                    <option value="__custom__">-- Tulis Nama Kitab Lain --</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nama Kitab *</label>
                  <input
                    required
                    type="text"
                    value={form.kitab_name}
                    onChange={(e) => setForm({ ...form, kitab_name: e.target.value })}
                    placeholder="Contoh: Safinatun Najah"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Bidang Ilmu (Fan)</label>
                  <select
                    value={form.fan_ilmu}
                    onChange={(e) => setForm({ ...form, fan_ilmu: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {FAN_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
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

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Metode Pembelajaran</label>
                  <select
                    value={form.method}
                    onChange={(e) => setForm({ ...form, method: e.target.value as KitabMethod })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {METHOD_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Predikat / Pemahaman</label>
                  <select
                    value={form.grade}
                    onChange={(e) => setForm({ ...form, grade: e.target.value as QualityGrade })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {GRADE_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Bab / Fasal / Bait / Halaman
                  </label>
                  <input
                    type="text"
                    value={form.chapter_or_bab}
                    onChange={(e) => setForm({ ...form, chapter_or_bab: e.target.value })}
                    placeholder="Contoh: Fasal Rukun Wudhu (Hal. 14) atau Bait 1–20"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Pemahaman, Nahwu/Shorof &amp; Keterangan Ustaz
                </label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Contoh: Mampu membaca tarkib dan memaknai kitab dengan baik."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
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
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">Hapus Catatan Kitab Kuning</h3>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 text-sm text-slate-700">
              Hapus catatan kitab <strong className="text-slate-900">{deleteTarget.kitab_name}</strong> milik{' '}
              <strong className="text-slate-900">{deleteTarget.student_name}</strong> ({deleteTarget.date})?
            </div>
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-700 hover:bg-red-800 text-white disabled:opacity-60 cursor-pointer"
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESET ALL KITAB KUNING MODAL */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">Reset Catatan Kitab Kuning</h3>
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
              <p>Apakah Anda yakin ingin mengosongkan seluruh catatan pelajaran Kitab Kuning?</p>
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                Semua riwayat catatan kitab kuning akan dihapus permanen. Data santri dan kelas tidak ikut terhapus.
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
                onClick={confirmResetAll}
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
