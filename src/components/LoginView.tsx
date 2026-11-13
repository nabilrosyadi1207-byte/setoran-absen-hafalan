import React, { useState } from 'react';
import { ArrowRight, BookOpen, Lock, LogIn, ShieldCheck, UserCheck } from 'lucide-react';
import { apiRequest, setStoredToken } from '../lib/api';
import type { User } from '../types';

interface LoginViewProps {
  onSuccess: (user: User) => void;
}

export function LoginView({ onSuccess }: LoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [quickLoading, setQuickLoading] = useState<'admin' | 'ustaz' | null>(null);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest<{ user: User; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setStoredToken(res.token);
      onSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal. Periksa kembali kredensial Anda.');
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickLogin(role: 'admin' | 'ustaz' = 'admin') {
    setError('');
    setQuickLoading(role);
    try {
      const res = await apiRequest<{ user: User; token: string }>('/api/auth/quick-login', {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      setStoredToken(res.token);
      onSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk otomatis.');
    } finally {
      setQuickLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Institutional Panel */}
      <div className="lg:w-1/2 bg-emerald-950 text-white p-8 lg:p-16 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-800 flex items-center justify-center border border-emerald-700">
              <BookOpen className="w-5 h-5 text-emerald-200" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-white">
              TahfidzTrack
            </span>
          </div>

          <div className="mt-12 lg:mt-20 max-w-lg">
            <p className="text-sm font-medium text-emerald-300 mb-3">
              Sistem Administrasi Tahfidz Al-Qur&apos;an
            </p>
            <h1 className="font-display text-3xl lg:text-4xl font-bold leading-tight text-white [text-wrap:balance]">
              Pencatatan Absensi Santri, Setoran Hafalan, dan Murojaah dalam Satu Ruang Kerja
            </h1>
            <p className="mt-5 text-base text-emerald-100/80 leading-relaxed">
              Dirancang khusus untuk Admin Pesantren serta Ustaz dan Ustazah pengampu halaqah.
              Data tersimpan permanen di server dengan dukungan ekspor laporan PDF, Excel, dan backup terstruktur.
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-emerald-900 grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm text-emerald-100/85">
          <div>
            <p className="font-semibold text-white">Akses Berbasis Peran</p>
            <p className="mt-1 text-emerald-200/75">
              Otorisasi terpisah untuk Administrator lembaga dan Ustaz/Ustazah pengampu kelas.
            </p>
          </div>
          <div>
            <p className="font-semibold text-white">Penyimpanan Permanen</p>
            <p className="mt-1 text-emerald-200/75">
              Database SQLite lokal dengan snapshot otomatis serta fitur ekspor dan pemulihan JSON.
            </p>
          </div>
        </div>
      </div>

      {/* Right Login Form */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <div className="mb-7">
            <h2 className="font-display text-2xl font-bold text-slate-900">
              Masuk ke Sistem
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Gunakan akun terdaftar atau langsung masuk tanpa username dan password.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-username" className="block text-sm font-medium text-slate-700 mb-1.5">
                Username
              </label>
              <input
                id="login-username"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username (mis. admin / ustaz)"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || quickLoading !== null}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>{loading ? 'Memverifikasi...' : 'Masuk Sekarang'}</span>
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-400">atau</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            disabled={loading || quickLoading !== null}
            onClick={() => handleQuickLogin('admin')}
            className="w-full py-2.5 px-4 rounded-lg border border-slate-300 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-600 text-slate-800 hover:text-emerald-950 text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 whitespace-nowrap cursor-pointer"
          >
            <span>
              {quickLoading === 'admin' ? 'Memasuki Sistem...' : 'Masuk Tanpa Username & Password'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="mt-7 pt-6 border-t border-slate-200">
            <p className="text-xs font-medium text-slate-500 mb-3">
              Akses Langsung Tanpa Password per Peran
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={loading || quickLoading !== null}
                onClick={() => handleQuickLogin('admin')}
                className="flex items-center gap-2.5 p-2.5 text-left rounded-lg border border-slate-200 hover:border-emerald-600 hover:bg-emerald-50/40 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">Admin Lembaga</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {quickLoading === 'admin' ? 'Memproses...' : 'Masuk langsung'}
                  </p>
                </div>
              </button>
              <button
                type="button"
                disabled={loading || quickLoading !== null}
                onClick={() => handleQuickLogin('ustaz')}
                className="flex items-center gap-2.5 p-2.5 text-left rounded-lg border border-slate-200 hover:border-emerald-600 hover:bg-emerald-50/40 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <UserCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">Ustaz Pengampu</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {quickLoading === 'ustaz' ? 'Memproses...' : 'Masuk langsung'}
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
