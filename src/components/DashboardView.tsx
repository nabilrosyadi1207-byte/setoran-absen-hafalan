import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Award,
  BarChart3,
  BookMarked,
  CalendarCheck,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest } from '../lib/api';
import type { DashboardSummary, MemorizationTrendPoint } from '../types';

interface DashboardViewProps {
  onNavigate: (tab: 'students' | 'attendance' | 'memorization' | 'kitab' | 'recap' | 'settings') => void;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    dataKey?: string;
    color?: string;
    payload?: MemorizationTrendPoint;
  }>;
  label?: string;
}

function TrendTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 shadow-sm text-xs">
      <p className="font-semibold text-slate-900 mb-1.5">{label}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-emerald-800 font-medium">Setoran Baru</span>
          <span className="font-mono font-semibold text-slate-900 tabular-nums">
            {point?.hafalan_count ?? 0}x ({point?.hafalan_ayat ?? 0} ayat)
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sky-700 font-medium">Murojaah</span>
          <span className="font-mono font-semibold text-slate-900 tabular-nums">
            {point?.murojaah_count ?? 0}x ({point?.murojaah_ayat ?? 0} ayat)
          </span>
        </div>
      </div>
    </div>
  );
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trendMode, setTrendMode] = useState<'weekly' | 'monthly'>('weekly');
  const [alertFilter, setAlertFilter] = useState<'all' | 'tercapai' | 'mendekati'>('all');

  async function loadDashboard() {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<DashboardSummary>('/api/dashboard');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat ringkasan.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
        <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700 flex items-center justify-between">
        <span>{error || 'Data ringkasan tidak tersedia.'}</span>
        <button
          onClick={loadDashboard}
          className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-800 font-medium cursor-pointer"
        >
          Muat Ulang
        </button>
      </div>
    );
  }

  const totalAttToday =
    data.today_attendance.hadir +
    data.today_attendance.sakit +
    data.today_attendance.izin +
    data.today_attendance.haid +
    data.today_attendance.alpha;

  const activeTrends =
    trendMode === 'weekly'
      ? data.memorization_trends?.weekly || []
      : data.memorization_trends?.monthly || [];

  const trendTotals = activeTrends.reduce(
    (acc, item) => ({
      hafalanCount: acc.hafalanCount + item.hafalan_count,
      hafalanAyat: acc.hafalanAyat + item.hafalan_ayat,
      murojaahCount: acc.murojaahCount + item.murojaah_count,
      murojaahAyat: acc.murojaahAyat + item.murojaah_ayat,
    }),
    { hafalanCount: 0, hafalanAyat: 0, murojaahCount: 0, murojaahAyat: 0 }
  );

  const hasTrendData = trendTotals.hafalanCount > 0 || trendTotals.murojaahCount > 0;

  const allAlerts = data.target_alerts || [];
  const achievedCount = allAlerts.filter((a) => a.status === 'tercapai').length;
  const approachingCount = allAlerts.filter((a) => a.status === 'mendekati').length;
  const filteredAlerts =
    alertFilter === 'all' ? allAlerts : allAlerts.filter((a) => a.status === alertFilter);

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Santri Aktif</span>
            <Users className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {data.active_students}
            </span>
            <span className="text-xs text-slate-500">
              dari {data.total_students} terdaftar · {data.total_classes} kelas
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Absensi Hari Ini ({data.today})</span>
            <CalendarCheck className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-emerald-700 tabular-nums">
              {data.today_attendance.hadir}
            </span>
            <span className="text-xs text-slate-600 tabular-nums">
              Sesi Hadir · S {data.today_attendance.sakit} · I {data.today_attendance.izin} · HD {data.today_attendance.haid} · A {data.today_attendance.alpha}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400 tabular-nums">
            {totalAttToday === 0
              ? 'Belum ada absensi diinput hari ini'
              : `${data.today_attendance.unrecorded} santri belum diabsen`}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Setoran Hafalan Bulan Ini</span>
            <BookMarked className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {data.month_hafalan_count}x
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              setoran · {data.month_hafalan_ayat} ayat baru
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Murojaah Bulan Ini</span>
            <RefreshCw className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {data.month_murojaah_count}x
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              ulangan · {data.month_murojaah_ayat} ayat
            </span>
          </div>
        </div>
      </div>

      {/* Trend Chart + Target Juz Indicators */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Recharts Memorization Trend */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-700" />
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Tren Jumlah Setoran Hafalan Santri
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {trendMode === 'weekly'
                  ? 'Perbandingan setoran hafalan baru & murojaah selama 8 minggu terakhir'
                  : 'Perbandingan setoran hafalan baru & murojaah selama 6 bulan terakhir'}
              </p>
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setTrendMode('weekly')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  trendMode === 'weekly'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Per Minggu
              </button>
              <button
                type="button"
                onClick={() => setTrendMode('monthly')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  trendMode === 'monthly'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Per Bulan
              </button>
            </div>
          </div>

          <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-5">
              <div>
                <span className="text-slate-500">Total Setoran Baru: </span>
                <span className="font-mono font-semibold text-emerald-800 tabular-nums">
                  {trendTotals.hafalanCount}x ({trendTotals.hafalanAyat} ayat)
                </span>
              </div>
              <div>
                <span className="text-slate-500">Total Murojaah: </span>
                <span className="font-mono font-semibold text-sky-700 tabular-nums">
                  {trendTotals.murojaahCount}x ({trendTotals.murojaahAyat} ayat)
                </span>
              </div>
            </div>
            {!hasTrendData && (
              <button
                type="button"
                onClick={() => onNavigate('memorization')}
                className="text-emerald-800 hover:text-emerald-950 font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Catat Setoran Pertama</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="p-5">
            <div className="h-[265px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activeTrends} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<TrendTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                    iconType="square"
                  />
                  <Bar
                    dataKey="hafalan_count"
                    name="Setoran Baru"
                    fill="#065f46"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="murojaah_count"
                    name="Murojaah"
                    fill="#0284c7"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {!hasTrendData && (
              <p className="text-center text-xs text-slate-400 mt-1">
                Grafik akan terisi otomatis begitu santri mulai menyetorkan hafalan atau murojaah.
              </p>
            )}
          </div>
        </div>

        {/* Target Juz Achievement Indicators / Notifications */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-600" />
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Indikator Target Juz Santri
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Santri yang mencapai/melampaui target atau mendekati batas target
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('memorization')}
              className="text-xs font-medium text-emerald-800 hover:text-emerald-950 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Mutaba&apos;ah</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAlertFilter('all')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                  alertFilter === 'all'
                    ? 'bg-white border border-slate-200 text-slate-900'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua (<span className="font-mono tabular-nums">{allAlerts.length}</span>)
              </button>
              <button
                type="button"
                onClick={() => setAlertFilter('tercapai')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                  alertFilter === 'tercapai'
                    ? 'bg-white border border-emerald-200 text-emerald-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tercapai (<span className="font-mono tabular-nums">{achievedCount}</span>)
              </button>
              <button
                type="button"
                onClick={() => setAlertFilter('mendekati')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                  alertFilter === 'mendekati'
                    ? 'bg-white border border-amber-200 text-amber-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mendekati (<span className="font-mono tabular-nums">{approachingCount}</span>)
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
            {filteredAlerts.length === 0 ? (
              <div className="p-7 text-center">
                <TrendingUp className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">
                  {allAlerts.length === 0
                    ? 'Belum ada santri yang mendekati atau melampaui target juz.'
                    : 'Tidak ada santri pada kategori filter ini.'}
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Notifikasi apresiasi muncul otomatis saat capaian santri mencapai ≥ 80% target atau tersisa ≤ 1,5 juz.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('memorization')}
                  className="mt-3 px-3.5 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  Catat Setoran Hafalan
                </button>
              </div>
            ) : (
              filteredAlerts.map((item) => {
                const isAchieved = item.status === 'tercapai';
                const surplusJuz = Math.max(0, Math.round((item.current_juz - item.target_juz) * 10) / 10);
                const barWidth = Math.min(100, Math.max(4, item.progress_pct));

                return (
                  <div key={item.student_id} className="px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {item.full_name}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                          NIS {item.nis} · {item.class_name}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold flex items-center gap-1 shrink-0 ${
                          isAchieved ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {isAchieved ? (
                          <>
                            <Award className="w-3.5 h-3.5" />
                            <span>{surplusJuz > 0 ? 'Melampaui Target' : 'Target Tercapai'}</span>
                          </>
                        ) : (
                          <>
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>Mendekati Target</span>
                          </>
                        )}
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            isAchieved ? 'bg-emerald-600' : 'bg-amber-500'
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums shrink-0">
                        {item.current_juz} / {item.target_juz} Juz ({item.progress_pct}%)
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="truncate">
                        {isAchieved
                          ? surplusJuz > 0
                            ? `Melampaui +${surplusJuz} juz — beri apresiasi & tambah target`
                            : 'Target juz terpenuhi — siap naik target berikutnya'
                          : `Kurang ${item.remaining_juz} juz lagi — beri motivasi tambahan`}
                      </span>
                      {item.last_surah && (
                        <span className="font-mono text-slate-400 shrink-0 tabular-nums">
                          {item.last_surah}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Main Two-Column Content */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Class Breakdown Table */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Ringkasan Per Halaqah &amp; Kelas
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kehadiran hari ini dan capaian setoran bulan berjalan
              </p>
            </div>
            <button
              onClick={() => onNavigate('attendance')}
              className="text-xs font-medium text-emerald-800 hover:text-emerald-950 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Input Absensi</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Kelas / Halaqah</th>
                  <th className="py-2.5 px-4">Pengampu</th>
                  <th className="py-2.5 px-4 text-right">Santri</th>
                  <th className="py-2.5 px-4 text-right">Hadir Hari Ini</th>
                  <th className="py-2.5 px-4 text-right">Setoran Bln Ini</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {data.class_breakdown.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 text-sm">
                      Belum ada kelas terdaftar.
                    </td>
                  </tr>
                ) : (
                  data.class_breakdown.map((cls) => (
                    <tr key={cls.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{cls.name}</p>
                        <p className="text-xs text-slate-500">{cls.level}</p>
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-xs">
                        {cls.ustaz_name || 'Belum ditentukan'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                        {cls.student_count}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
                        {cls.today_hadir}/{cls.student_count}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                        {cls.month_hafalan}x
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Memorization & Murojaah */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Setoran &amp; Murojaah Terbaru
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                8 catatan mutaba&apos;ah hafalan terakhir
              </p>
            </div>
            <button
              onClick={() => onNavigate('memorization')}
              className="text-xs font-medium text-emerald-800 hover:text-emerald-950 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Catat Setoran</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {data.recent_logs.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Belum ada catatan setoran atau murojaah.
              </div>
            ) : (
              data.recent_logs.map((log) => (
                <div key={log.id} className="px-5 py-3.5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {log.student_name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {log.type === 'hafalan' ? 'Setoran Baru' : 'Murojaah'} · Juz {log.juz} · {log.surah_name} ({log.ayat_start}–{log.ayat_end})
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`text-xs font-semibold ${
                          log.quality === 'Mengulang'
                            ? 'text-red-700'
                            : log.quality === 'Mumtaz'
                              ? 'text-emerald-700'
                              : 'text-slate-700'
                        }`}
                      >
                        {log.quality}
                      </span>
                      <p className="text-[11px] font-mono text-slate-400 tabular-nums mt-0.5">
                        {log.date}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
