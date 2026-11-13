export type UserRole = 'admin' | 'ustaz';

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  nip_or_kode: string;
  phone: string;
  is_active: number;
  created_at: string;
}

export interface ClassItem {
  id: number;
  name: string;
  level: string;
  ustaz_id: number | null;
  ustaz_name?: string | null;
  schedule: string;
  target_juz: number;
  room: string;
  student_count?: number;
  created_at: string;
}

export interface Student {
  id: number;
  nis: string;
  full_name: string;
  gender: 'L' | 'P';
  birth_place: string;
  birth_date: string;
  class_id: number;
  class_name?: string;
  guardian_name: string;
  guardian_phone: string;
  address: string;
  entry_date: string;
  target_juz: number;
  initial_juz: number;
  status: 'Aktif' | 'Cuti' | 'Lulus' | 'Berhenti';
  notes: string;
  created_at: string;
  recent_logs?: MemorizationLog[];
}

export type AttendanceStatus = 'H' | 'S' | 'I' | 'A' | 'HD';

export const ATTENDANCE_SESSIONS = ['Subuh', 'Zuhur', 'Asar', 'Magrib', 'Isya'] as const;
export type AttendanceSession = (typeof ATTENDANCE_SESSIONS)[number];

export const ATTENDANCE_CLASSES = ['Kelas Diniyah', "Kelas Tahfidz Al-Qur'an"] as const;
export const ATTENDANCE_SUBJECTS = ["Tahfidz Al Qur'an", 'Kitab Kuning'] as const;
export type AttendanceSubject = (typeof ATTENDANCE_SUBJECTS)[number];

export const ATTENDANCE_TEACHERS = [
  'TGH AHMAD SADRI QH S. Pdi',
  'Ustadz M Nabil Rosyadi Lc',
  "Ustadz Mi'rojussibyan QH. S.Pdi",
] as const;

export interface AttendanceRecord {
  id: number;
  student_id: number;
  class_id: number;
  class_label: string;
  subject: string;
  teacher_name: string;
  date: string;
  session_type: string;
  status: AttendanceStatus;
  notes: string;
  recorded_by: number | null;
  recorded_by_name?: string | null;
  updated_at: string;
}

export interface AttendanceRecapRow {
  student_id: number;
  nis: string;
  full_name: string;
  gender: 'L' | 'P';
  class_name: string;
  status: string;
  hadir: number;
  sakit: number;
  izin: number;
  haid: number;
  alpha: number;
  total_sessions: number;
  attendance_rate: number;
  sessions: Record<string, AttendanceStatus | ''>;
}

export type MemorizationType = 'hafalan' | 'murojaah';
export type QualityGrade = 'Mumtaz' | 'Jayyid Jiddan' | 'Jayyid' | 'Maqbul' | 'Mengulang';

export interface MemorizationLog {
  id: number;
  student_id: number;
  student_name?: string;
  student_nis?: string;
  class_id?: number;
  class_name?: string;
  type: MemorizationType;
  date: string;
  juz: number;
  surah_number: number;
  surah_name: string;
  ayat_start: number;
  ayat_end: number;
  total_ayat: number;
  quality: QualityGrade;
  murojaah_category: string;
  notes: string;
  ustaz_id: number | null;
  ustaz_name?: string | null;
  created_at: string;
}

export type KitabMethod = 'Bandongan' | 'Sorogan' | 'Hafalan Nadhom' | 'Praktik Baca Kitab';

export interface KitabKuningLog {
  id: number;
  student_id: number;
  student_name?: string;
  student_nis?: string;
  class_id?: number;
  class_name?: string;
  date: string;
  kitab_name: string;
  fan_ilmu: string;
  method: KitabMethod;
  chapter_or_bab: string;
  grade: QualityGrade;
  notes: string;
  ustaz_id: number | null;
  ustaz_name?: string | null;
  created_at: string;
}

export interface StudentRecap {
  student_id: number;
  nis: string;
  full_name: string;
  gender: 'L' | 'P';
  class_id: number;
  class_name: string;
  status: string;
  target_juz: number;
  hadir: number;
  sakit: number;
  izin: number;
  haid: number;
  alpha: number;
  total_days: number;
  attendance_rate: number;
  hafalan_count: number;
  hafalan_ayat: number;
  murojaah_count: number;
  murojaah_ayat: number;
  last_surah: string | null;
  last_ayat: string | null;
}

export interface InstitutionSettings {
  institution_name: string;
  institution_address: string;
  head_name: string;
  academic_year: string;
}

export interface MemorizationTrendPoint {
  period: string;
  label: string;
  hafalan_count: number;
  hafalan_ayat: number;
  murojaah_count: number;
  murojaah_ayat: number;
}

export interface TargetJuzAlert {
  student_id: number;
  nis: string;
  full_name: string;
  class_name: string;
  initial_juz: number;
  target_juz: number;
  hafalan_ayat: number;
  current_juz: number;
  remaining_juz: number;
  progress_pct: number;
  status: 'tercapai' | 'mendekati';
  last_surah: string | null;
  last_date: string | null;
}

export interface DashboardSummary {
  total_students: number;
  active_students: number;
  total_classes: number;
  today: string;
  today_attendance: {
    hadir: number;
    sakit: number;
    izin: number;
    haid: number;
    alpha: number;
    unrecorded: number;
  };
  month_hafalan_count: number;
  month_hafalan_ayat: number;
  month_murojaah_count: number;
  month_murojaah_ayat: number;
  class_breakdown: Array<{
    id: number;
    name: string;
    level: string;
    ustaz_name: string | null;
    student_count: number;
    today_hadir: number;
    month_hafalan: number;
  }>;
  recent_logs: MemorizationLog[];
  memorization_trends: {
    weekly: MemorizationTrendPoint[];
    monthly: MemorizationTrendPoint[];
  };
  target_alerts: TargetJuzAlert[];
}

export interface BackupSnapshot {
  filename: string;
  size_bytes: number;
  created_at: string;
}
