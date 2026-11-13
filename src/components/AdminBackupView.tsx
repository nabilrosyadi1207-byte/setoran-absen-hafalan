import React, { useEffect, useRef, useState } from 'react';
import {
  Database,
  Download,
  HardDrive,
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiRequest, downloadAuthenticatedFile } from '../lib/api';
import type { BackupSnapshot, InstitutionSettings, User, UserRole } from '../types';

interface AdminBackupViewProps {
  currentUser: User;
  settings: InstitutionSettings;
  onSettingsUpdated: (next: InstitutionSettings) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function AdminBackupView({
  currentUser,
  settings,
  onSettingsUpdated,
}: AdminBackupViewProps) {
  const isAdmin = currentUser.role === 'admin';
  const [tab, setTab] = useState<'backup' | 'accounts' | 'institution'>('backup');

  const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([]);
  const [snapshotLabel, setSnapshotLabel] = useState('rutin');
  const [users, setUsers] = useState<User[]>([]);
  const [instForm, setInstForm] = useState<InstitutionSettings>(settings);

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Account Modal
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({
    username: '',
    full_name: '',
    role: 'ustaz' as UserRole,
    nip_or_kode: '',
    phone: '',
    password: '',
    is_active: 1,
  });

  // Change own password
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });

  useEffect(() => {
    setInstForm(settings);
  }, [settings]);

  async function loadSnapshots() {
    try {
      const res = await apiRequest<{ snapshots: BackupSnapshot[] }>('/api/backup/snapshots');
      setSnapshots(res.snapshots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar snapshot.');
    }
  }

  async function loadUsers() {
    try {
      const res = await apiRequest<{ users: User[] }>('/api/users');
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar akun.');
    }
  }

  useEffect(() => {
    loadSnapshots();
    loadUsers();
  }, []);

  async function handleCreateSnapshot() {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await apiRequest('/api/backup/snapshots', {
        method: 'POST',
        body: JSON.stringify({ label: snapshotLabel || 'manual' }),
      });
      setNotice('Snapshot backup permanen berhasil dibuat di server.');
      await loadSnapshots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat snapshot.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadFullBackup() {
    try {
      await downloadAuthenticatedFile(
        '/api/backup/export',
        `tahfidztrack-backup-${new Date().toISOString().slice(0, 10)}.json`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunduh backup.');
    }
  }

  async function handleUploadRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (
      !window.confirm(
        `Pulihkan seluruh database dari file "${file.name}"? Sistem akan membuat snapshot pengaman terlebih dahulu sebelum menimpa data saat ini.`
      )
    ) {
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await apiRequest<{
        ok: boolean;
        restored: { classes: number; students: number; attendance: number; memorization_logs: number };
      }>('/api/backup/restore', {
        method: 'POST',
        body: JSON.stringify(parsed),
      });
      setNotice(
        `Pemulihan berhasil: ${res.restored.classes} kelas, ${res.restored.students} santri, ${res.restored.attendance} absensi, ${res.restored.memorization_logs} catatan hafalan.`
      );
      await loadSnapshots();
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memulihkan file backup.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRestoreSnapshot(filename: string) {
    if (
      !window.confirm(
        `Pulihkan database ke snapshot "${filename}"? Data saat ini akan dicadangkan otomatis sebelum dipulihkan.`
      )
    ) {
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await apiRequest<{
        ok: boolean;
        restored: { classes: number; students: number; attendance: number; memorization_logs: number };
      }>(`/api/backup/snapshots/${encodeURIComponent(filename)}/restore`, {
        method: 'POST',
      });
      setNotice(
        `Database dipulihkan ke ${filename} (${res.restored.students} santri, ${res.restored.memorization_logs} catatan hafalan).`
      );
      await loadSnapshots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memulihkan snapshot.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSnapshot(filename: string) {
    if (!window.confirm(`Hapus file snapshot "${filename}" dari server?`)) return;
    try {
      await apiRequest(`/api/backup/snapshots/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      await loadSnapshots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus snapshot.');
    }
  }

  function openNewUser() {
    setEditingUser(null);
    setUserForm({
      username: '',
      full_name: '',
      role: 'ustaz',
      nip_or_kode: '',
      phone: '',
      password: '',
      is_active: 1,
    });
    setUserModalOpen(true);
  }

  function openEditUser(u: User) {
    setEditingUser(u);
    setUserForm({
      username: u.username,
      full_name: u.full_name,
      role: u.role,
      nip_or_kode: u.nip_or_kode,
      phone: u.phone,
      password: '',
      is_active: u.is_active,
    });
    setUserModalOpen(true);
  }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      if (editingUser) {
        await apiRequest(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            full_name: userForm.full_name,
            role: userForm.role,
            nip_or_kode: userForm.nip_or_kode,
            phone: userForm.phone,
            is_active: userForm.is_active,
            ...(userForm.password ? { password: userForm.password } : {}),
          }),
        });
        setNotice(`Akun "${userForm.full_name}" berhasil diperbarui.`);
      } else {
        await apiRequest('/api/users', {
          method: 'POST',
          body: JSON.stringify(userForm),
        });
        setNotice(`Akun baru "${userForm.username}" berhasil dibuat.`);
      }
      setUserModalOpen(false);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan akun.');
    } finally {
      setLoading(false);
    }
  }

  async function deleteUser(u: User) {
    if (!window.confirm(`Hapus akun "${u.full_name}" (${u.username})?`)) return;
    try {
      await apiRequest(`/api/users/${u.id}`, { method: 'DELETE' });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus akun.');
    }
  }

  async function handleChangeOwnPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (pwForm.new_password !== pwForm.confirm_password) {
      setError('Konfirmasi password baru tidak cocok.');
      return;
    }
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: pwForm.current_password,
          new_password: pwForm.new_password,
        }),
      });
      setNotice('Password Anda berhasil diubah.');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah password.');
    }
  }

  async function saveInstitutionSettings(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await apiRequest<{ settings: InstitutionSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(instForm),
      });
      onSettingsUpdated(res.settings);
      setNotice('Identitas lembaga untuk kop laporan PDF & Excel berhasil disimpan.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Sub-navigation */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
        <button
          onClick={() => setTab('backup')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            tab === 'backup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Backup &amp; Pemulihan Permanen
        </button>
        <button
          onClick={() => setTab('accounts')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            tab === 'accounts' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {isAdmin ? 'Akun Admin & Ustaz/ah' : 'Keamanan Akun'}
        </button>
        <button
          onClick={() => setTab('institution')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            tab === 'institution' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Identitas Lembaga
        </button>
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

      {tab === 'backup' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Local JSON Download & Restore */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-emerald-800 font-display text-base font-semibold">
                  <Database className="w-4 h-4" />
                  <span>Ekspor &amp; Pulihkan File Backup (.JSON)</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                  Seluruh data santri, kelas, absensi harian/bulanan, catatan hafalan, murojaah, dan pengaturan lembaga disimpan permanen di database SQLite server (<code className="font-mono text-slate-800">data/pesantren.db</code>). Unduh salinan arsip JSON untuk disimpan di komputer atau cloud pribadi Anda.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100">
                <button
                  onClick={handleDownloadFullBackup}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Backup Lengkap (.JSON)</span>
                </button>
                {isAdmin && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/json,.json"
                      onChange={handleUploadRestore}
                      className="hidden"
                    />
                    <button
                      disabled={loading}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Pulihkan dari File Backup</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Create Server Snapshot */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-slate-900 font-display text-base font-semibold">
                  <HardDrive className="w-4 h-4 text-emerald-700" />
                  <span>Buat Snapshot Cadangan di Server</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                  Simpan titik pemulihan (snapshot) langsung di direktori arsip server sebelum melakukan perubahan besar atau akhir bulan.
                </p>
              </div>
              <div className="flex items-center gap-2.5 pt-2 border-t border-slate-100">
                <input
                  type="text"
                  value={snapshotLabel}
                  onChange={(e) => setSnapshotLabel(e.target.value)}
                  placeholder="Label snapshot (mis. akhir-bulan)"
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <button
                  disabled={loading}
                  onClick={handleCreateSnapshot}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Simpan Snapshot
                </button>
              </div>
            </div>
          </div>

          {/* Snapshot List */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Riwayat Snapshot Cadangan Server ({snapshots.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">Nama File Snapshot</th>
                    <th className="py-2.5 px-4">Waktu Dibuat</th>
                    <th className="py-2.5 px-4 text-right">Ukuran</th>
                    <th className="py-2.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {snapshots.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 text-xs">
                        Belum ada snapshot cadangan di server.
                      </td>
                    </tr>
                  ) : (
                    snapshots.map((snap) => (
                      <tr key={snap.filename} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono text-xs text-slate-800">{snap.filename}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500 tabular-nums">
                          {new Date(snap.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 tabular-nums">
                          {formatBytes(snap.size_bytes)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() =>
                                downloadAuthenticatedFile(
                                  `/api/backup/snapshots/${encodeURIComponent(snap.filename)}/download`,
                                  snap.filename
                                )
                              }
                              className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                            >
                              Unduh
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => handleRestoreSnapshot(snap.filename)}
                                  className="px-2.5 py-1 text-xs font-medium rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 flex items-center gap-1 cursor-pointer"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Pulihkan</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteSnapshot(snap.filename)}
                                  className="p-1.5 rounded text-slate-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                                  title="Hapus Snapshot"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
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

      {tab === 'accounts' && (
        <div className="space-y-6">
          {isAdmin && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    Manajemen Akun Admin &amp; Ustaz/Ustazah
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tambahkan atau kelola kredensial login untuk Admin dan seluruh pengampu halaqah.
                  </p>
                </div>
                <button
                  onClick={openNewUser}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Akun</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                      <th className="py-2.5 px-4">Username</th>
                      <th className="py-2.5 px-4">Nama Lengkap</th>
                      <th className="py-2.5 px-4">Peran</th>
                      <th className="py-2.5 px-4">Kode / NIP</th>
                      <th className="py-2.5 px-4">No. HP</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono text-xs text-slate-700">{u.username}</td>
                        <td className="py-3 px-4 font-medium text-slate-900">{u.full_name}</td>
                        <td className="py-3 px-4 text-xs font-semibold text-slate-700">
                          {u.role === 'admin' ? 'Administrator' : 'Ustaz / Ustazah'}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">{u.nip_or_kode || '-'}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">{u.phone || '-'}</td>
                        <td className="py-3 px-4 text-xs font-semibold">
                          <span className={u.is_active ? 'text-emerald-700' : 'text-red-700'}>
                            {u.is_active ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => openEditUser(u)}
                              className="p-1.5 rounded-md hover:bg-slate-200/70 text-slate-600 hover:text-slate-900 cursor-pointer"
                              title="Edit Akun / Reset Password"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {u.id !== currentUser.id && (
                              <button
                                onClick={() => deleteUser(u)}
                                className="p-1.5 rounded-md hover:bg-red-100 text-slate-500 hover:text-red-700 cursor-pointer"
                                title="Hapus Akun"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Own Password Form */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-lg">
            <div className="flex items-center gap-2 text-slate-900 font-display text-base font-semibold mb-1">
              <KeyRound className="w-4 h-4 text-emerald-700" />
              <span>Ubah Password Akun Saya ({currentUser.username})</span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Perbarui kata sandi Anda secara berkala untuk menjaga keamanan data santri.
            </p>
            <form onSubmit={handleChangeOwnPassword} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Password Saat Ini</label>
                <input
                  required
                  type="password"
                  value={pwForm.current_password}
                  onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Password Baru (min. 6 karakter)</label>
                <input
                  required
                  minLength={6}
                  type="password"
                  value={pwForm.new_password}
                  onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Konfirmasi Password Baru</label>
                <input
                  required
                  minLength={6}
                  type="password"
                  value={pwForm.confirm_password}
                  onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white cursor-pointer"
              >
                Simpan Password Baru
              </button>
            </form>
          </div>
        </div>
      )}

      {tab === 'institution' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl">
          <h3 className="font-display text-base font-semibold text-slate-900">
            Identitas Lembaga &amp; Kop Laporan PDF / Excel
          </h3>
          <p className="text-xs text-slate-500 mt-1 mb-5">
            Informasi ini tampil otomatis pada bagian kop surat dan tanda tangan laporan PDF maupun Excel.
          </p>
          <form onSubmit={saveInstitutionSettings} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Pondok / Rumah Tahfidz</label>
              <input
                disabled={!isAdmin}
                type="text"
                value={instForm.institution_name}
                onChange={(e) => setInstForm({ ...instForm, institution_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Lengkap</label>
              <input
                disabled={!isAdmin}
                type="text"
                value={instForm.institution_address}
                onChange={(e) => setInstForm({ ...instForm, institution_address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Pimpinan / Mudir</label>
                <input
                  disabled={!isAdmin}
                  type="text"
                  value={instForm.head_name}
                  onChange={(e) => setInstForm({ ...instForm, head_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tahun Ajaran Aktif</label>
                <input
                  disabled={!isAdmin}
                  type="text"
                  value={instForm.academic_year}
                  onChange={(e) => setInstForm({ ...instForm, academic_year: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg disabled:bg-slate-50"
                />
              </div>
            </div>
            {isAdmin && (
              <div className="pt-2">
                <button
                  disabled={loading}
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Identitas Lembaga</span>
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* USER MODAL */}
      {userModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-slate-900">
                {editingUser ? 'Edit Akun Pengguna' : 'Tambah Akun Baru'}
              </h3>
              <button onClick={() => setUserModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={saveUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Username *</label>
                <input
                  required
                  disabled={!!editingUser}
                  type="text"
                  value={userForm.username}
                  onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                <input
                  required
                  type="text"
                  value={userForm.full_name}
                  onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                  placeholder="Mis. Ust. Abdullah Karim"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Peran *</label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ustaz">Ustaz / Ustazah</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kode / NIP</label>
                  <input
                    type="text"
                    value={userForm.nip_or_kode}
                    onChange={(e) => setUserForm({ ...userForm, nip_or_kode: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">No. HP / WhatsApp</label>
                <input
                  type="text"
                  value={userForm.phone}
                  onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {editingUser ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password * (min. 6 karakter)'}
                </label>
                <input
                  required={!editingUser}
                  minLength={6}
                  type="password"
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              {editingUser && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status Akun</label>
                  <select
                    value={userForm.is_active}
                    onChange={(e) => setUserForm({ ...userForm, is_active: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value={1}>Aktif</option>
                    <option value={0}>Nonaktif</option>
                  </select>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white cursor-pointer"
                >
                  Simpan Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
