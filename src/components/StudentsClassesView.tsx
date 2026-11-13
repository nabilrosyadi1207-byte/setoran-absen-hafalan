import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileText,
  History,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { exportIndividualStudentPdf, exportStudentsExcel } from '../lib/exportReports';
import type {
  AttendanceRecord,
  ClassItem,
  InstitutionSettings,
  MemorizationLog,
  Student,
  User,
} from '../types';

interface StudentsClassesViewProps {
  currentUser: User;
  settings: InstitutionSettings;
}

export function StudentsClassesView({ currentUser, settings }: StudentsClassesViewProps) {
  const [subTab, setSubTab] = useState<'students' | 'classes'>('students');
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Student Modal
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentForm, setStudentForm] = useState({
    nis: '',
    full_name: '',
    gender: 'L' as 'L' | 'P',
    birth_place: '',
    birth_date: '',
    class_id: '',
    guardian_name: '',
    guardian_phone: '',
    address: '',
    entry_date: new Date().toISOString().slice(0, 10),
    target_juz: '30',
    initial_juz: '0',
    status: 'Aktif' as 'Aktif' | 'Cuti' | 'Lulus' | 'Berhenti',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  // Class Modal
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [classForm, setClassForm] = useState({
    name: '',
    level: 'Mutawassith',
    ustaz_id: '',
    schedule: "Ba'da Subuh & Ba'da Ashar",
    target_juz: '10',
    room: '',
  });

  // Detail Drawer
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<{
    student: Student;
    attendance: AttendanceRecord[];
    logs: MemorizationLog[];
  } | null>(null);

  // Delete Confirmation Modal
  const [deleteTargetStudent, setDeleteTargetStudent] = useState<Student | null>(null);
  const [deleteTargetClass, setDeleteTargetClass] = useState<ClassItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState('');
  const [expandedStudentId, setExpandedStudentId] = useState<number | null>(null);

  const isAdmin = currentUser.role === 'admin';

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [clsRes, stuRes, usrRes] = await Promise.all([
        apiRequest<{ classes: ClassItem[] }>('/api/classes'),
        apiRequest<{ students: Student[] }>('/api/students'),
        apiRequest<{ users: User[] }>('/api/users'),
      ]);
      setClasses(clsRes.classes);
      setStudents(stuRes.students);
      setUsers(usrRes.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const filteredStudents = students.filter((s) => {
    if (filterClass !== 'all' && String(s.class_id) !== filterClass) return false;
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        s.full_name.toLowerCase().includes(q) ||
        s.nis.toLowerCase().includes(q) ||
        s.guardian_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  function openNewStudent() {
    setEditingStudent(null);
    setStudentForm({
      nis: '',
      full_name: '',
      gender: 'L',
      birth_place: '',
      birth_date: '',
      class_id: classes[0] ? String(classes[0].id) : '',
      guardian_name: '',
      guardian_phone: '',
      address: '',
      entry_date: new Date().toISOString().slice(0, 10),
      target_juz: '30',
      initial_juz: '0',
      status: 'Aktif',
      notes: '',
    });
    setStudentModalOpen(true);
  }

  function openEditStudent(s: Student) {
    setEditingStudent(s);
    setStudentForm({
      nis: s.nis,
      full_name: s.full_name,
      gender: s.gender,
      birth_place: s.birth_place,
      birth_date: s.birth_date,
      class_id: String(s.class_id),
      guardian_name: s.guardian_name,
      guardian_phone: s.guardian_phone,
      address: s.address,
      entry_date: s.entry_date,
      target_juz: String(s.target_juz),
      initial_juz: String(s.initial_juz),
      status: s.status,
      notes: s.notes,
    });
    setStudentModalOpen(true);
  }

  async function saveStudent(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...studentForm,
        class_id: Number(studentForm.class_id),
        target_juz: Number(studentForm.target_juz) || 30,
        initial_juz: Number(studentForm.initial_juz) || 0,
      };
      if (editingStudent) {
        await apiRequest(`/api/students/${editingStudent.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/students', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setStudentModalOpen(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan data santri.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteStudent() {
    if (!deleteTargetStudent) return;
    setDeleting(true);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/students/${deleteTargetStudent.id}`, { method: 'DELETE' });
      const deletedName = deleteTargetStudent.full_name;
      if (detailData?.student.id === deleteTargetStudent.id) {
        setDetailData(null);
      }
      setDeleteTargetStudent(null);
      setNotice(`Data santri "${deletedName}" berhasil dihapus.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus santri.');
      setDeleteTargetStudent(null);
    } finally {
      setDeleting(false);
    }
  }

  async function openStudentDetail(s: Student) {
    setDetailLoading(true);
    try {
      const res = await apiRequest<{
        student: Student;
        attendance: AttendanceRecord[];
        logs: MemorizationLog[];
      }>(`/api/students/${s.id}/detail`);
      setDetailData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat detail santri.');
    } finally {
      setDetailLoading(false);
    }
  }

  function openNewClass() {
    setEditingClass(null);
    setClassForm({
      name: '',
      level: 'Mutawassith',
      ustaz_id: '',
      schedule: "Ba'da Subuh & Ba'da Ashar",
      target_juz: '10',
      room: '',
    });
    setClassModalOpen(true);
  }

  function openEditClass(c: ClassItem) {
    setEditingClass(c);
    setClassForm({
      name: c.name,
      level: c.level,
      ustaz_id: c.ustaz_id ? String(c.ustaz_id) : '',
      schedule: c.schedule,
      target_juz: String(c.target_juz),
      room: c.room,
    });
    setClassModalOpen(true);
  }

  async function saveClass(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...classForm,
        ustaz_id: classForm.ustaz_id ? Number(classForm.ustaz_id) : null,
        target_juz: Number(classForm.target_juz) || 5,
      };
      if (editingClass) {
        await apiRequest(`/api/classes/${editingClass.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/classes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setClassModalOpen(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan kelas.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteClass() {
    if (!deleteTargetClass) return;
    setDeleting(true);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/classes/${deleteTargetClass.id}`, { method: 'DELETE' });
      const deletedName = deleteTargetClass.name;
      setDeleteTargetClass(null);
      setNotice(`Kelas "${deletedName}" berhasil dihapus.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus kelas.');
      setDeleteTargetClass(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Sub-navigation + Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          <button
            onClick={() => setSubTab('students')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'students' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Data Lengkap Santri ({students.length})
          </button>
          <button
            onClick={() => setSubTab('classes')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'classes' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Data Kelas &amp; Halaqah ({classes.length})
          </button>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {subTab === 'students' ? (
            <>
              <button
                onClick={() => exportStudentsExcel(filteredStudents)}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Ekspor Excel Santri</span>
              </button>
              <button
                onClick={openNewStudent}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Santri</span>
              </button>
            </>
          ) : (
            isAdmin && (
              <button
                onClick={openNewClass}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Kelas / Halaqah</span>
              </button>
            )
          )}
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

      {subTab === 'students' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Filter Bar */}
          <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama santri, NIS, atau nama wali..."
                className="w-full pl-9 pr-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="all">Semua Kelas / Halaqah</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="all">Semua Status</option>
              <option value="Aktif">Aktif</option>
              <option value="Cuti">Cuti</option>
              <option value="Lulus">Lulus</option>
              <option value="Berhenti">Berhenti</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">NIS</th>
                  <th className="py-2.5 px-4">Nama Lengkap</th>
                  <th className="py-2.5 px-4">Kelas / Halaqah</th>
                  <th className="py-2.5 px-4">Wali Santri</th>
                  <th className="py-2.5 px-4 text-right">Target</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      Memuat data santri...
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <p className="font-medium text-slate-700">Tidak ada data santri yang sesuai filter.</p>
                      <button
                        onClick={openNewStudent}
                        className="mt-3 px-3.5 py-1.5 rounded-lg bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
                      >
                        Tambah Santri Baru
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((s) => {
                    const recentLogs = s.recent_logs || [];
                    const isExpanded = expandedStudentId === s.id;

                    return (
                      <React.Fragment key={s.id}>
                        <tr className={`hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-slate-50/70' : ''}`}>
                          <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums">
                            {s.nis}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900">{s.full_name}</p>
                            <p className="text-xs text-slate-500">
                              {s.gender === 'L' ? 'Putra' : 'Putri'} · {s.birth_place || '-'}, {s.birth_date || '-'}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-slate-700 text-xs">
                            {s.class_name || '-'}
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-xs font-medium text-slate-800">{s.guardian_name || '-'}</p>
                            <p className="text-xs font-mono text-slate-500 tabular-nums">{s.guardian_phone || '-'}</p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                            {s.target_juz} Juz
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`text-xs font-semibold ${
                                s.status === 'Aktif'
                                  ? 'text-emerald-700'
                                  : s.status === 'Lulus'
                                    ? 'text-sky-700'
                                    : s.status === 'Berhenti'
                                      ? 'text-red-700'
                                      : 'text-amber-700'
                              }`}
                            >
                              {s.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setExpandedStudentId((prev) => (prev === s.id ? null : s.id))}
                                title="Lihat Ringkasan 5 Setoran Terakhir"
                                className={`px-2 py-1 rounded-md border inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                                  isExpanded
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                                }`}
                              >
                                <History className="w-3.5 h-3.5" />
                                <span>5 Setoran</span>
                                {recentLogs.length > 0 && (
                                  <span className="font-mono text-[11px] text-emerald-700 tabular-nums">
                                    ({recentLogs.length})
                                  </span>
                                )}
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                onClick={() => openStudentDetail(s)}
                                title="Lihat Profil & Riwayat"
                                className="p-1.5 rounded-md hover:bg-slate-200/70 text-slate-600 hover:text-slate-900 cursor-pointer"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => openEditStudent(s)}
                                title="Ubah Data Santri"
                                className="p-1.5 rounded-md hover:bg-slate-200/70 text-slate-600 hover:text-slate-900 cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeleteTargetStudent(s)}
                                title="Hapus Santri"
                                className="px-2 py-1 rounded-md hover:bg-red-50 border border-transparent hover:border-red-200 text-red-600 hover:text-red-700 inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Hapus</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={7} className="px-5 py-4 border-t border-slate-200/80">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-900">
                                    Ringkasan 5 Setoran Terakhir — {s.full_name}
                                  </h4>
                                  <p className="text-[11px] text-slate-500">
                                    Histori singkat setoran hafalan baru &amp; murojaah tanpa berpindah halaman
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openStudentDetail(s)}
                                  className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 whitespace-nowrap self-start sm:self-auto cursor-pointer"
                                >
                                  Lihat Profil &amp; Rapor Lengkap →
                                </button>
                              </div>

                              {recentLogs.length === 0 ? (
                                <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500">
                                  Santri ini belum memiliki catatan setoran hafalan atau murojaah.
                                </div>
                              ) : (
                                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                                        <th className="py-2 px-3">Tanggal</th>
                                        <th className="py-2 px-3">Jenis</th>
                                        <th className="py-2 px-3">Juz &amp; Surah / Ayat</th>
                                        <th className="py-2 px-3 text-right">Jml Ayat</th>
                                        <th className="py-2 px-3">Predikat</th>
                                        <th className="py-2 px-3">Pengampu &amp; Catatan</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs">
                                      {recentLogs.map((log) => (
                                        <tr key={log.id} className="hover:bg-slate-50/60">
                                          <td className="py-2 px-3 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                                            {log.date}
                                          </td>
                                          <td className="py-2 px-3 whitespace-nowrap">
                                            <span
                                              className={`font-semibold ${
                                                log.type === 'hafalan' ? 'text-emerald-700' : 'text-sky-700'
                                              }`}
                                            >
                                              {log.type === 'hafalan' ? 'Setoran Baru' : 'Murojaah'}
                                            </span>
                                          </td>
                                          <td className="py-2 px-3 text-slate-900 font-medium">
                                            Juz {log.juz} · {log.surah_name} ({log.ayat_start}–{log.ayat_end})
                                          </td>
                                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                                            {log.total_ayat}
                                          </td>
                                          <td className="py-2 px-3 whitespace-nowrap">
                                            <span
                                              className={`font-semibold ${
                                                log.quality === 'Mengulang'
                                                  ? 'text-red-700'
                                                  : log.quality === 'Mumtaz'
                                                    ? 'text-emerald-700'
                                                    : 'text-slate-700'
                                              }`}
                                            >
                                              {log.quality}
                                            </span>
                                          </td>
                                          <td className="py-2 px-3 text-slate-500">
                                            <span>{log.ustaz_name || '-'}</span>
                                            {log.notes ? <span className="text-slate-400"> · {log.notes}</span> : null}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CLASSES TABLE */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Nama Kelas / Halaqah</th>
                  <th className="py-2.5 px-4">Jenjang / Marhalah</th>
                  <th className="py-2.5 px-4">Ustaz / Ustazah Pengampu</th>
                  <th className="py-2.5 px-4">Jadwal &amp; Ruang</th>
                  <th className="py-2.5 px-4 text-right">Target</th>
                  <th className="py-2.5 px-4 text-right">Santri Aktif</th>
                  {isAdmin && <th className="py-2.5 px-4 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {classes.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="py-10 text-center text-slate-500">
                      Belum ada kelas terdaftar.
                    </td>
                  </tr>
                ) : (
                  classes.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-900">{c.name}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{c.level}</td>
                      <td className="py-3 px-4 text-xs text-slate-700">{c.ustaz_name || 'Belum ditentukan'}</td>
                      <td className="py-3 px-4">
                        <p className="text-xs text-slate-700">{c.schedule}</p>
                        <p className="text-xs text-slate-400">{c.room || '-'}</p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                        {c.target_juz} Juz
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-semibold tabular-nums text-emerald-700">
                        {c.student_count ?? 0}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => openEditClass(c)}
                              title="Edit Kelas"
                              className="p-1.5 rounded-md hover:bg-slate-200/70 text-slate-600 hover:text-slate-900 cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTargetClass(c)}
                              title="Hapus Kelas"
                              className="p-1.5 rounded-md hover:bg-red-100 text-slate-500 hover:text-red-700 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STUDENT MODAL */}
      {studentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-slate-900">
                {editingStudent ? 'Edit Data Santri' : 'Tambah Santri Baru'}
              </h3>
              <button onClick={() => setStudentModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={saveStudent} className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">NIS / Nomor Induk *</label>
                  <input
                    required
                    type="text"
                    value={studentForm.nis}
                    onChange={(e) => setStudentForm({ ...studentForm, nis: e.target.value })}
                    placeholder="20260105"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                  <input
                    required
                    type="text"
                    value={studentForm.full_name}
                    onChange={(e) => setStudentForm({ ...studentForm, full_name: e.target.value })}
                    placeholder="Nama lengkap santri"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kelas / Halaqah *</label>
                  <select
                    required
                    value={studentForm.class_id}
                    onChange={(e) => setStudentForm({ ...studentForm, class_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">-- Pilih Kelas --</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Kelamin</label>
                  <select
                    value={studentForm.gender}
                    onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value as 'L' | 'P' })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="L">Laki-laki (Putra)</option>
                    <option value="P">Perempuan (Putri)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tempat Lahir</label>
                  <input
                    type="text"
                    value={studentForm.birth_place}
                    onChange={(e) => setStudentForm({ ...studentForm, birth_place: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Lahir</label>
                  <input
                    type="date"
                    value={studentForm.birth_date}
                    onChange={(e) => setStudentForm({ ...studentForm, birth_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nama Wali / Orang Tua</label>
                  <input
                    type="text"
                    value={studentForm.guardian_name}
                    onChange={(e) => setStudentForm({ ...studentForm, guardian_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">No. HP / WhatsApp Wali</label>
                  <input
                    type="text"
                    value={studentForm.guardian_phone}
                    onChange={(e) => setStudentForm({ ...studentForm, guardian_phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Masuk</label>
                  <input
                    type="date"
                    value={studentForm.entry_date}
                    onChange={(e) => setStudentForm({ ...studentForm, entry_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status Santri</label>
                  <select
                    value={studentForm.status}
                    onChange={(e) => setStudentForm({ ...studentForm, status: e.target.value as 'Aktif' | 'Cuti' | 'Lulus' | 'Berhenti' })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Cuti">Cuti</option>
                    <option value="Lulus">Lulus</option>
                    <option value="Berhenti">Berhenti</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Target Hafalan (Juz)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={studentForm.target_juz}
                    onChange={(e) => setStudentForm({ ...studentForm, target_juz: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Hafalan Awal Masuk (Juz)</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={30}
                    value={studentForm.initial_juz}
                    onChange={(e) => setStudentForm({ ...studentForm, initial_juz: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Lengkap</label>
                <input
                  type="text"
                  value={studentForm.address}
                  onChange={(e) => setStudentForm({ ...studentForm, address: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Catatan Pembimbing</label>
                <textarea
                  rows={2}
                  value={studentForm.notes}
                  onChange={(e) => setStudentForm({ ...studentForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setStudentModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Data Santri'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLASS MODAL */}
      {classModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-slate-900">
                {editingClass ? 'Edit Kelas / Halaqah' : 'Tambah Kelas / Halaqah'}
              </h3>
              <button onClick={() => setClassModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={saveClass} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Kelas / Halaqah *</label>
                <input
                  required
                  type="text"
                  value={classForm.name}
                  onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                  placeholder="Mis. Halaqah Utsman bin Affan"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jenjang / Marhalah</label>
                  <input
                    type="text"
                    value={classForm.level}
                    onChange={(e) => setClassForm({ ...classForm, level: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Target Hafalan Kelas (Juz)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={classForm.target_juz}
                    onChange={(e) => setClassForm({ ...classForm, target_juz: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Ustaz / Ustazah Pengampu</label>
                <select
                  value={classForm.ustaz_id}
                  onChange={(e) => setClassForm({ ...classForm, ustaz_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">-- Pilih Pengampu --</option>
                  {users
                    .filter((u) => u.is_active === 1)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.role === 'admin' ? 'Admin' : 'Ustaz/ah'})
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jadwal Halaqah</label>
                  <input
                    type="text"
                    value={classForm.schedule}
                    onChange={(e) => setClassForm({ ...classForm, schedule: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Ruangan / Lokasi</label>
                  <input
                    type="text"
                    value={classForm.room}
                    onChange={(e) => setClassForm({ ...classForm, room: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setClassModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Kelas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STUDENT DETAIL DRAWER */}
      {(detailData || detailLoading) && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto border-l border-slate-200 p-6 flex flex-col">
            {detailLoading || !detailData ? (
              <div className="py-12 text-center text-sm text-slate-500">Memuat profil lengkap santri...</div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
                  <div>
                    <p className="text-xs font-mono text-slate-500 tabular-nums">
                      NIS {detailData.student.nis} · {detailData.student.class_name} · {detailData.student.status}
                    </p>
                    <h3 className="font-display text-xl font-bold text-slate-900 mt-1">
                      {detailData.student.full_name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        exportIndividualStudentPdf(
                          detailData.student,
                          detailData.attendance,
                          detailData.logs,
                          settings
                        )
                      }
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Cetak Rapor PDF</span>
                    </button>
                    <button
                      onClick={() => setDetailData(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Biodata Grid */}
                <div className="py-5 border-b border-slate-200 grid grid-cols-2 gap-y-3 gap-x-6 text-xs">
                  <div>
                    <span className="text-slate-500">Jenis Kelamin</span>
                    <p className="font-medium text-slate-900 mt-0.5">
                      {detailData.student.gender === 'L' ? 'Laki-laki (Putra)' : 'Perempuan (Putri)'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Tempat, Tanggal Lahir</span>
                    <p className="font-medium text-slate-900 mt-0.5">
                      {detailData.student.birth_place || '-'}, {detailData.student.birth_date || '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Wali Santri</span>
                    <p className="font-medium text-slate-900 mt-0.5">
                      {detailData.student.guardian_name || '-'} ({detailData.student.guardian_phone || '-'})
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Target &amp; Hafalan Awal</span>
                    <p className="font-mono font-medium text-slate-900 mt-0.5 tabular-nums">
                      Target {detailData.student.target_juz} Juz · Awal {detailData.student.initial_juz} Juz
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500">Alamat</span>
                    <p className="font-medium text-slate-900 mt-0.5">{detailData.student.address || '-'}</p>
                  </div>
                  {detailData.student.notes && (
                    <div className="col-span-2">
                      <span className="text-slate-500">Catatan Pembimbing</span>
                      <p className="text-slate-800 mt-0.5">{detailData.student.notes}</p>
                    </div>
                  )}
                </div>

                {/* Attendance History */}
                <div className="py-5 border-b border-slate-200">
                  <h4 className="font-display text-sm font-semibold text-slate-900 mb-3">
                    Riwayat Kehadiran Terbaru ({detailData.attendance.length} Hari Tercatat)
                  </h4>
                  {detailData.attendance.length === 0 ? (
                    <p className="text-xs text-slate-500">Belum ada catatan absensi.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {detailData.attendance.slice(0, 28).map((a) => (
                        <div
                          key={a.id}
                          title={`${a.date} (${a.session_type}): ${a.status}${a.notes ? ` (${a.notes})` : ''}`}
                          className={`px-2 py-1 rounded border text-[11px] font-mono tabular-nums ${
                            a.status === 'H'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : a.status === 'S'
                                ? 'bg-amber-50 border-amber-200 text-amber-800'
                                : a.status === 'I'
                                  ? 'bg-sky-50 border-sky-200 text-sky-800'
                                  : a.status === 'HD'
                                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                                    : 'bg-red-50 border-red-200 text-red-800'
                          }`}
                        >
                          {a.date.slice(5)} · {a.session_type} · {a.status}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Memorization & Murojaah History */}
                <div className="py-5">
                  <h4 className="font-display text-sm font-semibold text-slate-900 mb-3">
                    Riwayat Setoran Hafalan &amp; Murojaah ({detailData.logs.length})
                  </h4>
                  {detailData.logs.length === 0 ? (
                    <p className="text-xs text-slate-500">Belum ada setoran hafalan atau murojaah.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                      {detailData.logs.map((l) => (
                        <div key={l.id} className="p-3 text-xs flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {l.type === 'hafalan' ? 'Setoran Baru' : `Murojaah (${l.murojaah_category || 'Harian'})`} · Juz {l.juz} · {l.surah_name}
                            </p>
                            <p className="text-slate-600 font-mono mt-0.5 tabular-nums">
                              Ayat {l.ayat_start}–{l.ayat_end} ({l.total_ayat} ayat) · {l.ustaz_name || '-'}
                            </p>
                            {l.notes && <p className="text-slate-500 mt-1">{l.notes}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-semibold text-emerald-800">{l.quality}</span>
                            <p className="font-mono text-slate-400 tabular-nums mt-0.5">{l.date}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* DELETE STUDENT CONFIRMATION MODAL */}
      {deleteTargetStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Hapus Data Santri
              </h3>
              <button
                type="button"
                onClick={() => setDeleteTargetStudent(null)}
                disabled={deleting}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm text-slate-700">
              <p>
                Apakah Anda yakin ingin menghapus santri{' '}
                <strong className="text-slate-900">{deleteTargetStudent.full_name}</strong>{' '}
                <span className="font-mono text-xs text-slate-500">(NIS {deleteTargetStudent.nis})</span>?
              </p>
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                Seluruh riwayat absensi, setoran hafalan, dan murojaah santri ini akan ikut terhapus permanen.
              </p>
            </div>
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTargetStudent(null)}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteStudent}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-700 hover:bg-red-800 text-white disabled:opacity-60 cursor-pointer"
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus Santri'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CLASS CONFIRMATION MODAL */}
      {deleteTargetClass && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Hapus Kelas / Halaqah
              </h3>
              <button
                type="button"
                onClick={() => setDeleteTargetClass(null)}
                disabled={deleting}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 text-sm text-slate-700">
              Apakah Anda yakin ingin menghapus kelas{' '}
              <strong className="text-slate-900">{deleteTargetClass.name}</strong>?
            </div>
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTargetClass(null)}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteClass}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-700 hover:bg-red-800 text-white disabled:opacity-60 cursor-pointer"
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus Kelas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
