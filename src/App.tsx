import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  BookMarked,
  BookOpen,
  CalendarCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { AdminBackupView } from './components/AdminBackupView';
import { AttendanceView } from './components/AttendanceView';
import { DashboardView } from './components/DashboardView';
import { KitabKuningView } from './components/KitabKuningView';
import { LoginView } from './components/LoginView';
import { MemorizationView } from './components/MemorizationView';
import { RecapReportsView } from './components/RecapReportsView';
import { StudentsClassesView } from './components/StudentsClassesView';
import { apiRequest, setStoredToken } from './lib/api';
import type { InstitutionSettings, User } from './types';

type NavTab = 'dashboard' | 'students' | 'attendance' | 'memorization' | 'kitab' | 'recap' | 'settings';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Ringkasan', icon: LayoutDashboard },
  { id: 'students', label: 'Santri & Kelas', icon: Users },
  { id: 'attendance', label: 'Absensi Harian & Bulanan', icon: CalendarCheck },
  { id: 'memorization', label: 'Setoran & Murojaah', icon: BookMarked },
  { id: 'kitab', label: 'Pelajaran Kitab Kuning', icon: ScrollText },
  { id: 'recap', label: 'Rekap & Laporan PDF/Excel', icon: BarChart3 },
  { id: 'settings', label: 'Akun & Backup Permanen', icon: Settings },
];

const TAB_TITLES: Record<NavTab, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Ringkasan Halaqah',
    subtitle: 'Pantauan kehadiran santri, setoran hafalan Al-Qur’an, dan kajian Kitab Kuning',
  },
  students: {
    title: 'Data Lengkap Santri & Kelas',
    subtitle: 'Kelola biodata santri, wali, target juz, serta pembagian halaqah',
  },
  attendance: {
    title: 'Absensi Harian & Matriks Bulanan',
    subtitle: 'Pencatatan kehadiran harian 5 waktu dan rekap kalender bulanan per kelas',
  },
  memorization: {
    title: 'Catatan Setoran Hafalan & Murojaah',
    subtitle: 'Mutaba’ah hafalan surah/ayat baru (ziyadah) dan pengulangan (murojaah)',
  },
  kitab: {
    title: 'Pelajaran Kitab Kuning',
    subtitle: 'Pencatatan kajian Bandongan, Sorogan, Hafalan Nadhom, dan Praktik Baca Kitab Kuning',
  },
  recap: {
    title: 'Rekap Kehadiran & Ekspor Laporan',
    subtitle: 'Ringkasan kehadiran setiap santri dengan ekspor PDF dan Excel resmi',
  },
  settings: {
    title: 'Pengaturan Akun & Backup Permanen',
    subtitle: 'Kelola akun Admin/Ustaz, identitas lembaga, serta snapshot & pemulihan database',
  },
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settings, setSettings] = useState<InstitutionSettings>({
    institution_name: "Pondok Pesantren Tahfidz Al-Qur'an Al-Falah",
    institution_address: 'Jl. Pesantren Raya No. 45, Kota Depok',
    head_name: 'KH. Ahmad Munir, Lc., M.Ag.',
    academic_year: '2026/2027',
  });

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await apiRequest<{ user: User }>('/api/auth/me');
        setUser(res.user);
      } catch {
        setUser(null);
      } finally {
        setAuthChecked(true);
      }
    }
    checkSession();
  }, []);

  useEffect(() => {
    if (!user) return;
    apiRequest<{ settings: InstitutionSettings }>('/api/settings')
      .then((res) => {
        if (res.settings) setSettings(res.settings);
      })
      .catch(() => {});
  }, [user]);

  async function handleLogout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken(null);
    setUser(null);
    setActiveTab('dashboard');
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        Memeriksa sesi pengguna...
      </div>
    );
  }

  if (!user) {
    return <LoginView onSuccess={(loggedInUser) => setUser(loggedInUser)} />;
  }

  const currentMeta = TAB_TITLES[activeTab];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-[264px] lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-16 px-5 border-b border-slate-200 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-800 flex items-center justify-center text-white shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            TahfidzTrack
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left cursor-pointer ${
                  active
                    ? 'bg-emerald-50 text-emerald-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-emerald-700' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200">
          <div className="mb-3">
            <p className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {user.role === 'admin' ? 'Administrator' : 'Ustaz / Ustazah'} · {user.username}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col border-r border-slate-200 z-10">
            <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-800 flex items-center justify-center text-white">
                  <BookOpen className="w-4 h-4" />
                </div>
                <span className="font-display text-lg font-bold text-slate-900">TahfidzTrack</span>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left cursor-pointer ${
                      active ? 'bg-emerald-50 text-emerald-900 font-semibold' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-emerald-700' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-900">{user.full_name}</p>
              <p className="text-[11px] text-slate-500 mb-3">
                {user.role === 'admin' ? 'Administrator' : 'Ustaz / Ustazah'}
              </p>
              <button
                onClick={handleLogout}
                className="w-full py-2 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-[264px] flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate">
                {currentMeta.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <span className="hidden md:inline text-xs text-slate-500 whitespace-nowrap">
              {settings.institution_name} · {settings.academic_year}
            </span>
            <button
              onClick={() => setActiveTab('memorization')}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              Catat Setoran
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto">
          <p className="text-xs sm:text-sm text-slate-500 mb-6">{currentMeta.subtitle}</p>

          {activeTab === 'dashboard' && <DashboardView onNavigate={(tab) => setActiveTab(tab)} />}
          {activeTab === 'students' && <StudentsClassesView currentUser={user} settings={settings} />}
          {activeTab === 'attendance' && <AttendanceView settings={settings} />}
          {activeTab === 'memorization' && <MemorizationView settings={settings} />}
          {activeTab === 'kitab' && <KitabKuningView settings={settings} />}
          {activeTab === 'recap' && <RecapReportsView settings={settings} />}
          {activeTab === 'settings' && (
            <AdminBackupView
              currentUser={user}
              settings={settings}
              onSettingsUpdated={(next) => setSettings(next)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
