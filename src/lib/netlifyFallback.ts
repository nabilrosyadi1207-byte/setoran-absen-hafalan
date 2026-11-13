import type {
  AttendanceRecord,
  ClassItem,
  DashboardSummary,
  KitabKuningLog,
  MemorizationLog,
  MemorizationTrendPoint,
  Student,
  TargetJuzAlert,
  User,
} from '../types';

const STORAGE_KEY = 'tahfidztrack_netlify_db_v1';

interface StoredUser extends User {
  password: string;
}

interface StoredSession {
  token: string;
  user_id: number;
  expires_at: string;
}

interface StoredSnapshot {
  filename: string;
  size_bytes: number;
  created_at: string;
  content: string;
}

interface LocalDatabase {
  users: StoredUser[];
  sessions: StoredSession[];
  settings: Record<string, string>;
  classes: ClassItem[];
  students: Student[];
  attendance: AttendanceRecord[];
  memorization_logs: MemorizationLog[];
  kitab_kuning_logs: KitabKuningLog[];
  snapshots: StoredSnapshot[];
  nextIds: {
    user: number;
    classItem: number;
    student: number;
    attendance: number;
    memorization: number;
    kitab: number;
  };
}

export class LocalApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const VALID_SESSIONS = ['Subuh', 'Zuhur', 'Asar', 'Magrib', 'Isya'] as const;
const VALID_SUBJECTS = ["Tahfidz Al Qur'an", 'Kitab Kuning'] as const;
const VALID_KITAB_METHODS = ['Bandongan', 'Sorogan', 'Hafalan Nadhom', 'Praktik Baca Kitab'] as const;
const VALID_GRADES = ['Mumtaz', 'Jayyid Jiddan', 'Jayyid', 'Maqbul', 'Mengulang'] as const;

const SEEDED_STUDENTS: Array<{ name: string; gender: 'L' | 'P' }> = [
  { name: 'Nur Akila Azklya', gender: 'P' },
  { name: 'Risme Gina Fatin', gender: 'P' },
  { name: 'Nadila Islami', gender: 'P' },
  { name: 'Riski Hasani', gender: 'L' },
  { name: 'M Assodiqqi', gender: 'L' },
  { name: 'L. rizki dewata saputara', gender: 'L' },
  { name: 'Lara Novelia', gender: 'P' },
  { name: 'Ahmad khaerul hamdi', gender: 'L' },
  { name: 'Giantara', gender: 'L' },
  { name: 'M Gozali', gender: 'L' },
  { name: 'Torik Rizki', gender: 'L' },
  { name: 'Naura Haerun Nisa', gender: 'P' },
  { name: 'Haris Yadi Rizki', gender: 'L' },
  { name: 'Janeta sadin maharani', gender: 'P' },
  { name: 'Salwa mardatillah', gender: 'P' },
  { name: 'Lenzi Febriana', gender: 'P' },
  { name: "Peti Rapl'a", gender: 'P' },
  { name: 'Alinda Sopia Letisa', gender: 'P' },
  { name: 'Nadia Riskiyanti Alpani', gender: 'P' },
  { name: 'Habibatun Nazwa', gender: 'P' },
  { name: 'Wilya Anggraini Natasya', gender: 'P' },
  { name: 'Akifa Naila', gender: 'P' },
  { name: 'Aninda Yuniarti', gender: 'P' },
  { name: 'Dhia Aminatu Zohria', gender: 'P' },
  { name: 'Azwan Kahfi', gender: 'L' },
  { name: 'L Gilang Kurniaramdani', gender: 'L' },
  { name: 'Prasetio Adiguna', gender: 'L' },
  { name: 'Aria Saputra', gender: 'L' },
  { name: 'Andika Febrian Maulana', gender: 'L' },
  { name: 'Riski Fathurrahman', gender: 'L' },
  { name: 'M Joe Abi Nopal', gender: 'L' },
  { name: 'FAQIH SODIQ', gender: 'L' },
  { name: 'AHMAD YAZID IHSAN', gender: 'L' },
  { name: 'DHAFIN AZKARRADI', gender: 'L' },
  { name: 'M ROZALI HUSEN', gender: 'L' },
  { name: 'AHMAD ZIADI AKBAR', gender: 'L' },
  { name: 'M FAESAL ZAIINI', gender: 'L' },
  { name: 'MARWAH MAULANA', gender: 'P' },
  { name: 'AHMAD ZIDNIL HAQIQI', gender: 'L' },
  { name: 'SRI HANDAYANI', gender: 'P' },
  { name: 'FAUZAN', gender: 'L' },
  { name: 'TIFA MELANI', gender: 'P' },
  { name: 'ARISTA JUNIANTARI', gender: 'P' },
  { name: 'ZAFIRA KHOLIFATUS S', gender: 'P' },
  { name: 'APRIL AINI', gender: 'P' },
  { name: 'FANISA', gender: 'P' },
  { name: 'SITI AUDIA NISA', gender: 'P' },
  { name: 'NINDI AYU CAHYANI', gender: 'P' },
  { name: 'M ULUL AZMI', gender: 'L' },
  { name: 'EVA ELIANA', gender: 'P' },
  { name: 'LALU HAERUL AZAM', gender: 'L' },
  { name: 'ABDUL HAYI', gender: 'L' },
  { name: 'SUCI RAHMATUL IZA', gender: 'P' },
  { name: 'KASIH AMALANI', gender: 'P' },
  { name: 'AGUS BELING', gender: 'L' },
  { name: 'AHMAD SOPIANDI', gender: 'L' },
  { name: 'EVRIL', gender: 'P' },
];

function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function createSeedDatabase(): LocalDatabase {
  const now = new Date().toISOString();
  const users: StoredUser[] = [
    {
      id: 1,
      username: 'admin',
      full_name: 'Ustadz M Nabil Rosyadi Lc',
      role: 'admin',
      nip_or_kode: 'ADM-001',
      phone: '081234567890',
      password: 'admin123',
      is_active: 1,
      created_at: now,
    },
    {
      id: 2,
      username: 'ustaz',
      full_name: 'Ustadz M Nabil Rosyadi Lc',
      role: 'ustaz',
      nip_or_kode: 'UST-001',
      phone: '081234567890',
      password: 'ustaz123',
      is_active: 1,
      created_at: now,
    },
  ];

  const classes: ClassItem[] = [
    {
      id: 1,
      name: "Kelas Tahfidz Al-Qur'an",
      level: 'Tahfidz Reguler',
      ustaz_id: 2,
      schedule: 'Subuh, Zuhur, Asar, Magrib, Isya & Kitab Kuning',
      target_juz: 30,
      room: 'Aula Utama Tahfidz',
      created_at: now,
    },
  ];

  const students: Student[] = SEEDED_STUDENTS.map((st, idx) => ({
    id: idx + 1,
    nis: `2026${String(idx + 1).padStart(3, '0')}`,
    full_name: st.name,
    gender: st.gender,
    birth_place: '',
    birth_date: '',
    class_id: 1,
    guardian_name: '',
    guardian_phone: '',
    address: '',
    entry_date: '2026-07-01',
    target_juz: 30,
    initial_juz: 0,
    status: 'Aktif',
    notes: '',
    created_at: now,
  }));

  return {
    users,
    sessions: [],
    settings: {
      institution_name: "Pondok Pesantren Tahfidz Al-Qur'an Al-Falah",
      institution_address: 'Jl. Pesantren Raya No. 45, Kec. Sukmajaya, Kota Depok',
      head_name: 'Ustadz M Nabil Rosyadi Lc',
      academic_year: '2026/2027',
    },
    classes,
    students,
    attendance: [],
    memorization_logs: [],
    kitab_kuning_logs: [],
    snapshots: [],
    nextIds: {
      user: users.length + 1,
      classItem: classes.length + 1,
      student: students.length + 1,
      attendance: 1,
      memorization: 1,
      kitab: 1,
    },
  };
}

function loadDb(): LocalDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalDatabase;
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.students)) {
        return parsed;
      }
    }
  } catch {
    // ignore corrupted storage
  }
  const fresh = createSeedDatabase();
  saveDb(fresh);
  return fresh;
}

function saveDb(db: LocalDatabase): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // ignore storage quota errors
  }
}

function stripPassword(u: StoredUser): User {
  const { password: _pw, ...safe } = u;
  return safe;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizeSession(val: unknown): string {
  const s = String(val || '').trim();
  const found = VALID_SESSIONS.find((v) => v.toLowerCase() === s.toLowerCase());
  return found || 'Subuh';
}

function normalizeSubject(val: unknown): string {
  const s = String(val || '').trim();
  const found = VALID_SUBJECTS.find((v) => v.toLowerCase() === s.toLowerCase());
  return found || "Tahfidz Al Qur'an";
}

function normalizeClassLabel(val: unknown): string {
  const s = String(val || '').trim();
  return s || 'Kelas Diniyah';
}

function normalizeTeacherName(val: unknown): string {
  const s = String(val || '').trim();
  return s || 'Ustadz M Nabil Rosyadi Lc';
}

function requireLocalUser(db: LocalDatabase, token: string | null): StoredUser {
  if (!token) {
    throw new LocalApiError('Sesi tidak ditemukan. Silakan login terlebih dahulu.', 401);
  }
  const sess = db.sessions.find((s) => s.token === token);
  if (!sess || new Date(sess.expires_at).getTime() < Date.now()) {
    throw new LocalApiError('Sesi telah berakhir atau akun nonaktif. Silakan login kembali.', 401);
  }
  const user = db.users.find((u) => u.id === sess.user_id && u.is_active === 1);
  if (!user) {
    throw new LocalApiError('Sesi telah berakhir atau akun nonaktif. Silakan login kembali.', 401);
  }
  return user;
}

function requireLocalAdmin(user: StoredUser): void {
  if (user.role !== 'admin') {
    throw new LocalApiError('Akses ditolak. Fitur ini khusus Administrator.', 403);
  }
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (!body || typeof body !== 'string') return {};
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function handleLocalNetlifyApi<T>(
  pathWithQuery: string,
  options: RequestInit = {},
  token: string | null
): T {
  const method = (options.method || 'GET').toUpperCase();
  const [pathname, queryStr = ''] = pathWithQuery.split('?');
  const query = new URLSearchParams(queryStr);
  const body = parseBody(options.body);
  const db = loadDb();

  const userNameMap = new Map(db.users.map((u) => [u.id, u.full_name]));
  const classNameMap = new Map(db.classes.map((c) => [c.id, c.name]));
  const studentMap = new Map(db.students.map((s) => [s.id, s]));

  // --- AUTH ---
  if (pathname === '/api/auth/login' && method === 'POST') {
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!username || !password) {
      throw new LocalApiError('Username dan password wajib diisi.', 400);
    }
    const found = db.users.find((u) => u.username === username && u.password === password);
    if (!found) {
      throw new LocalApiError('Username atau password salah.', 401);
    }
    if (found.is_active !== 1) {
      throw new LocalApiError('Akun Anda sedang dinonaktifkan oleh Admin.', 403);
    }
    const newToken = randomToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.sessions.push({ token: newToken, user_id: found.id, expires_at: expiresAt });
    saveDb(db);
    return { user: stripPassword(found), token: newToken } as T;
  }

  if (pathname === '/api/auth/quick-login' && method === 'POST') {
    const requestedRole = body.role === 'ustaz' ? 'ustaz' : 'admin';
    const found =
      db.users.find((u) => u.role === requestedRole && u.is_active === 1) ||
      db.users.find((u) => u.is_active === 1);
    if (!found) {
      throw new LocalApiError('Tidak ada akun aktif yang tersedia.', 404);
    }
    const newToken = randomToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.sessions.push({ token: newToken, user_id: found.id, expires_at: expiresAt });
    saveDb(db);
    return { user: stripPassword(found), token: newToken } as T;
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    if (token) {
      db.sessions = db.sessions.filter((s) => s.token !== token);
      saveDb(db);
    }
    return { ok: true } as T;
  }

  const currentUser = requireLocalUser(db, token);

  if (pathname === '/api/auth/me' && method === 'GET') {
    return { user: stripPassword(currentUser) } as T;
  }

  if (pathname === '/api/auth/change-password' && method === 'POST') {
    const cur = String(body.current_password || '');
    const nextPw = String(body.new_password || '');
    if (!cur || nextPw.length < 6) {
      throw new LocalApiError('Password baru minimal 6 karakter.', 400);
    }
    if (currentUser.password !== cur) {
      throw new LocalApiError('Password saat ini tidak sesuai.', 400);
    }
    currentUser.password = nextPw;
    saveDb(db);
    return { ok: true } as T;
  }

  // --- USERS ---
  if (pathname === '/api/users' && method === 'GET') {
    const users = [...db.users]
      .sort((a, b) => a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name))
      .map(stripPassword);
    return { users } as T;
  }

  if (pathname === '/api/users' && method === 'POST') {
    requireLocalAdmin(currentUser);
    const username = String(body.username || '').trim();
    const fullName = String(body.full_name || '').trim();
    const role = body.role as 'admin' | 'ustaz';
    const password = String(body.password || '');
    if (!username || !fullName || !password || !['admin', 'ustaz'].includes(role)) {
      throw new LocalApiError('Username, nama lengkap, peran, dan password wajib diisi.', 400);
    }
    if (password.length < 6) {
      throw new LocalApiError('Password minimal 6 karakter.', 400);
    }
    if (db.users.some((u) => u.username === username)) {
      throw new LocalApiError('Username sudah digunakan.', 409);
    }
    const created: StoredUser = {
      id: db.nextIds.user++,
      username,
      full_name: fullName,
      role,
      nip_or_kode: String(body.nip_or_kode || '').trim(),
      phone: String(body.phone || '').trim(),
      password,
      is_active: 1,
      created_at: new Date().toISOString(),
    };
    db.users.push(created);
    saveDb(db);
    return { user: stripPassword(created) } as T;
  }

  const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
  if (userMatch && method === 'PUT') {
    requireLocalAdmin(currentUser);
    const id = Number(userMatch[1]);
    const target = db.users.find((u) => u.id === id);
    if (!target) throw new LocalApiError('Akun tidak ditemukan.', 404);
    if (id === currentUser.id && body.is_active === 0) {
      throw new LocalApiError('Anda tidak dapat menonaktifkan akun yang sedang digunakan.', 400);
    }
    if (body.full_name !== undefined) target.full_name = String(body.full_name).trim();
    if (body.role === 'admin' || body.role === 'ustaz') target.role = body.role;
    if (body.nip_or_kode !== undefined) target.nip_or_kode = String(body.nip_or_kode).trim();
    if (body.phone !== undefined) target.phone = String(body.phone).trim();
    if (body.is_active !== undefined) target.is_active = Number(body.is_active) ? 1 : 0;
    if (body.password && String(body.password).length >= 6) target.password = String(body.password);
    saveDb(db);
    return { user: stripPassword(target) } as T;
  }

  if (userMatch && method === 'DELETE') {
    requireLocalAdmin(currentUser);
    const id = Number(userMatch[1]);
    if (id === currentUser.id) {
      throw new LocalApiError('Anda tidak dapat menghapus akun Anda sendiri.', 400);
    }
    const before = db.users.length;
    db.users = db.users.filter((u) => u.id !== id);
    if (db.users.length === before) throw new LocalApiError('Akun tidak ditemukan.', 404);
    db.sessions = db.sessions.filter((s) => s.user_id !== id);
    saveDb(db);
    return { ok: true } as T;
  }

  // --- SETTINGS ---
  if (pathname === '/api/settings' && method === 'GET') {
    return { settings: { ...db.settings } } as T;
  }

  if (pathname === '/api/settings' && method === 'PUT') {
    requireLocalAdmin(currentUser);
    for (const key of ['institution_name', 'institution_address', 'head_name', 'academic_year']) {
      if (body[key] !== undefined) db.settings[key] = String(body[key]).trim();
    }
    saveDb(db);
    return { settings: { ...db.settings } } as T;
  }

  // --- CLASSES ---
  if (pathname === '/api/classes' && method === 'GET') {
    const classes = [...db.classes]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({
        ...c,
        ustaz_name: c.ustaz_id ? userNameMap.get(c.ustaz_id) || null : null,
        student_count: db.students.filter((s) => s.class_id === c.id && s.status === 'Aktif').length,
      }));
    return { classes } as T;
  }

  if (pathname === '/api/classes' && method === 'POST') {
    requireLocalAdmin(currentUser);
    const name = String(body.name || '').trim();
    if (!name) throw new LocalApiError('Nama kelas / halaqah wajib diisi.', 400);
    const created: ClassItem = {
      id: db.nextIds.classItem++,
      name,
      level: String(body.level || 'Mutawassith').trim(),
      ustaz_id: body.ustaz_id ? Number(body.ustaz_id) : null,
      schedule: String(body.schedule || "Ba'da Subuh & Ba'da Ashar").trim(),
      target_juz: Number(body.target_juz) || 5,
      room: String(body.room || '').trim(),
      created_at: new Date().toISOString(),
    };
    db.classes.push(created);
    saveDb(db);
    return {
      classItem: {
        ...created,
        ustaz_name: created.ustaz_id ? userNameMap.get(created.ustaz_id) || null : null,
        student_count: 0,
      },
    } as T;
  }

  const classMatch = pathname.match(/^\/api\/classes\/(\d+)$/);
  if (classMatch && method === 'PUT') {
    requireLocalAdmin(currentUser);
    const id = Number(classMatch[1]);
    const target = db.classes.find((c) => c.id === id);
    if (!target) throw new LocalApiError('Kelas tidak ditemukan.', 404);
    if (body.name !== undefined) target.name = String(body.name).trim();
    if (body.level !== undefined) target.level = String(body.level).trim();
    if (body.ustaz_id !== undefined) target.ustaz_id = body.ustaz_id ? Number(body.ustaz_id) : null;
    if (body.schedule !== undefined) target.schedule = String(body.schedule).trim();
    if (body.target_juz !== undefined) target.target_juz = Number(body.target_juz);
    if (body.room !== undefined) target.room = String(body.room).trim();
    saveDb(db);
    return {
      classItem: {
        ...target,
        ustaz_name: target.ustaz_id ? userNameMap.get(target.ustaz_id) || null : null,
        student_count: db.students.filter((s) => s.class_id === target.id && s.status === 'Aktif').length,
      },
    } as T;
  }

  if (classMatch && method === 'DELETE') {
    requireLocalAdmin(currentUser);
    const id = Number(classMatch[1]);
    const count = db.students.filter((s) => s.class_id === id).length;
    if (count > 0) {
      throw new LocalApiError(`Kelas masih memiliki ${count} santri. Pindahkan santri terlebih dahulu.`, 400);
    }
    const before = db.classes.length;
    db.classes = db.classes.filter((c) => c.id !== id);
    if (db.classes.length === before) throw new LocalApiError('Kelas tidak ditemukan.', 404);
    saveDb(db);
    return { ok: true } as T;
  }

  // --- STUDENTS ---
  if (pathname === '/api/students' && method === 'GET') {
    const classId = query.get('classId');
    const status = query.get('status');
    const search = (query.get('search') || '').trim().toLowerCase();

    const filtered = db.students.filter((s) => {
      if (classId && classId !== 'all' && s.class_id !== Number(classId)) return false;
      if (status && status !== 'all' && s.status !== status) return false;
      if (search) {
        const hit =
          s.full_name.toLowerCase().includes(search) ||
          s.nis.toLowerCase().includes(search) ||
          s.guardian_name.toLowerCase().includes(search);
        if (!hit) return false;
      }
      return true;
    });

    const students = filtered
      .map((s) => {
        const recent_logs = db.memorization_logs
          .filter((m) => m.student_id === s.id)
          .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
          .slice(0, 5)
          .map((m) => ({
            ...m,
            ustaz_name: m.ustaz_id ? userNameMap.get(m.ustaz_id) || null : null,
          }));
        return {
          ...s,
          class_name: classNameMap.get(s.class_id) || '',
          recent_logs,
        };
      })
      .sort(
        (a, b) =>
          (a.class_name || '').localeCompare(b.class_name || '') ||
          a.full_name.localeCompare(b.full_name)
      );

    return { students } as T;
  }

  const studentDetailMatch = pathname.match(/^\/api\/students\/(\d+)\/detail$/);
  if (studentDetailMatch && method === 'GET') {
    const id = Number(studentDetailMatch[1]);
    const st = db.students.find((s) => s.id === id);
    if (!st) throw new LocalApiError('Santri tidak ditemukan.', 404);
    const attendance = db.attendance
      .filter((a) => a.student_id === id)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 60)
      .map((a) => ({
        ...a,
        recorded_by_name: a.recorded_by ? userNameMap.get(a.recorded_by) || null : null,
      }));
    const logs = db.memorization_logs
      .filter((m) => m.student_id === id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .map((m) => ({
        ...m,
        ustaz_name: m.ustaz_id ? userNameMap.get(m.ustaz_id) || null : null,
      }));
    return {
      student: { ...st, class_name: classNameMap.get(st.class_id) || '' },
      attendance,
      logs,
    } as T;
  }

  if (pathname === '/api/students' && method === 'POST') {
    const nis = String(body.nis || '').trim();
    const fullName = String(body.full_name || '').trim();
    const classId = Number(body.class_id);
    if (!nis || !fullName || !classId) {
      throw new LocalApiError('NIS, nama lengkap, dan kelas wajib diisi.', 400);
    }
    if (db.students.some((s) => s.nis === nis)) {
      throw new LocalApiError('NIS sudah terdaftar untuk santri lain.', 409);
    }
    const created: Student = {
      id: db.nextIds.student++,
      nis,
      full_name: fullName,
      gender: body.gender === 'P' ? 'P' : 'L',
      birth_place: String(body.birth_place || '').trim(),
      birth_date: String(body.birth_date || '').trim(),
      class_id: classId,
      guardian_name: String(body.guardian_name || '').trim(),
      guardian_phone: String(body.guardian_phone || '').trim(),
      address: String(body.address || '').trim(),
      entry_date: String(body.entry_date || getTodayStr()),
      target_juz: Number(body.target_juz) || 30,
      initial_juz: Number(body.initial_juz) || 0,
      status: ['Aktif', 'Cuti', 'Lulus', 'Berhenti'].includes(String(body.status))
        ? (body.status as Student['status'])
        : 'Aktif',
      notes: String(body.notes || '').trim(),
      created_at: new Date().toISOString(),
    };
    db.students.push(created);
    saveDb(db);
    return { student: { ...created, class_name: classNameMap.get(created.class_id) || '' } } as T;
  }

  const studentMatch = pathname.match(/^\/api\/students\/(\d+)$/);
  if (studentMatch && method === 'PUT') {
    const id = Number(studentMatch[1]);
    const target = db.students.find((s) => s.id === id);
    if (!target) throw new LocalApiError('Santri tidak ditemukan.', 404);
    const nextNis = body.nis !== undefined ? String(body.nis).trim() : target.nis;
    if (db.students.some((s) => s.nis === nextNis && s.id !== id)) {
      throw new LocalApiError('NIS sudah digunakan oleh santri lain.', 409);
    }
    target.nis = nextNis;
    if (body.full_name !== undefined) target.full_name = String(body.full_name).trim();
    if (body.gender !== undefined) target.gender = body.gender === 'P' ? 'P' : 'L';
    if (body.birth_place !== undefined) target.birth_place = String(body.birth_place).trim();
    if (body.birth_date !== undefined) target.birth_date = String(body.birth_date).trim();
    if (body.class_id !== undefined) target.class_id = Number(body.class_id);
    if (body.guardian_name !== undefined) target.guardian_name = String(body.guardian_name).trim();
    if (body.guardian_phone !== undefined) target.guardian_phone = String(body.guardian_phone).trim();
    if (body.address !== undefined) target.address = String(body.address).trim();
    if (body.entry_date !== undefined) target.entry_date = String(body.entry_date);
    if (body.target_juz !== undefined) target.target_juz = Number(body.target_juz);
    if (body.initial_juz !== undefined) target.initial_juz = Number(body.initial_juz);
    if (body.status !== undefined && ['Aktif', 'Cuti', 'Lulus', 'Berhenti'].includes(String(body.status))) {
      target.status = body.status as Student['status'];
    }
    if (body.notes !== undefined) target.notes = String(body.notes).trim();
    saveDb(db);
    return { student: { ...target, class_name: classNameMap.get(target.class_id) || '' } } as T;
  }

  if (studentMatch && method === 'DELETE') {
    const id = Number(studentMatch[1]);
    const before = db.students.length;
    db.students = db.students.filter((s) => s.id !== id);
    if (db.students.length === before) throw new LocalApiError('Santri tidak ditemukan.', 404);
    db.attendance = db.attendance.filter((a) => a.student_id !== id);
    db.memorization_logs = db.memorization_logs.filter((m) => m.student_id !== id);
    db.kitab_kuning_logs = db.kitab_kuning_logs.filter((k) => k.student_id !== id);
    saveDb(db);
    return { ok: true } as T;
  }

  // --- ATTENDANCE ---
  if (pathname === '/api/attendance' && method === 'GET') {
    const date = query.get('date');
    const month = query.get('month');
    const classId = query.get('classId');
    const classLabel = query.get('classLabel');
    const subject = query.get('subject');
    const teacherName = query.get('teacherName');
    const sessionType = query.get('sessionType');

    const records = db.attendance
      .filter((a) => {
        if (date && a.date !== date) return false;
        else if (!date && month && !a.date.startsWith(month)) return false;
        if (classId && classId !== 'all' && a.class_id !== Number(classId)) return false;
        if (classLabel && classLabel !== 'all' && a.class_label !== classLabel) return false;
        if (subject && subject !== 'all' && a.subject !== normalizeSubject(subject)) return false;
        if (teacherName && teacherName !== 'all' && a.teacher_name !== teacherName) return false;
        if (sessionType && sessionType !== 'all' && a.session_type !== normalizeSession(sessionType)) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.session_type.localeCompare(b.session_type))
      .map((a) => ({
        ...a,
        recorded_by_name: a.recorded_by ? userNameMap.get(a.recorded_by) || null : null,
      }));
    return { records } as T;
  }

  if (pathname === '/api/attendance/bulk' && method === 'POST') {
    const date = String(body.date || '');
    const entries = body.entries;
    if (!date || !Array.isArray(entries)) {
      throw new LocalApiError('Tanggal dan daftar absensi wajib dikirim.', 400);
    }
    const normalizedSession = normalizeSession(body.session_type);
    const normalizedClassLabel = normalizeClassLabel(body.class_label);
    const normalizedSubject = normalizeSubject(body.subject);
    const normalizedTeacher = normalizeTeacherName(body.teacher_name);
    const now = new Date().toISOString();

    for (const item of entries as Array<Record<string, unknown>>) {
      const sid = Number(item.student_id);
      const status = String(item.status || '');
      if (!sid || !['H', 'S', 'I', 'A', 'HD'].includes(status)) continue;
      const st = studentMap.get(sid);
      if (!st) continue;
      const existing = db.attendance.find(
        (a) =>
          a.student_id === sid &&
          a.date === date &&
          a.session_type === normalizedSession &&
          a.subject === normalizedSubject &&
          a.class_label === normalizedClassLabel
      );
      if (existing) {
        existing.class_id = Number(item.class_id || st.class_id);
        existing.teacher_name = normalizedTeacher;
        existing.status = status as AttendanceRecord['status'];
        existing.notes = String(item.notes || '').trim();
        existing.recorded_by = currentUser.id;
        existing.updated_at = now;
      } else {
        db.attendance.push({
          id: db.nextIds.attendance++,
          student_id: sid,
          class_id: Number(item.class_id || st.class_id),
          class_label: normalizedClassLabel,
          subject: normalizedSubject,
          teacher_name: normalizedTeacher,
          date,
          session_type: normalizedSession,
          status: status as AttendanceRecord['status'],
          notes: String(item.notes || '').trim(),
          recorded_by: currentUser.id,
          updated_at: now,
        });
      }
    }
    saveDb(db);
    return {
      ok: true,
      count: entries.length,
      session_type: normalizedSession,
      class_label: normalizedClassLabel,
      subject: normalizedSubject,
      teacher_name: normalizedTeacher,
    } as T;
  }

  if (pathname === '/api/attendance/toggle' && method === 'POST') {
    const sid = Number(body.student_id);
    const date = String(body.date || '');
    if (!sid || !date) throw new LocalApiError('student_id dan date wajib diisi.', 400);

    const normalizedSession = normalizeSession(body.session_type);
    const normalizedClassLabel = normalizeClassLabel(body.class_label);
    const normalizedSubject = normalizeSubject(body.subject);
    const normalizedTeacher = normalizeTeacherName(body.teacher_name);

    if (body.status === null || body.status === '') {
      db.attendance = db.attendance.filter(
        (a) =>
          !(
            a.student_id === sid &&
            a.date === date &&
            a.session_type === normalizedSession &&
            a.subject === normalizedSubject &&
            a.class_label === normalizedClassLabel
          )
      );
      saveDb(db);
      return { ok: true, record: null } as T;
    }

    const status = String(body.status || '');
    if (!['H', 'S', 'I', 'A', 'HD'].includes(status)) {
      throw new LocalApiError('Status absensi harus H, S, I, HD, atau A.', 400);
    }
    const st = studentMap.get(sid);
    if (!st) throw new LocalApiError('Santri tidak ditemukan.', 404);

    const now = new Date().toISOString();
    const noteText = String(body.notes || '').trim();
    let rec = db.attendance.find(
      (a) =>
        a.student_id === sid &&
        a.date === date &&
        a.session_type === normalizedSession &&
        a.subject === normalizedSubject &&
        a.class_label === normalizedClassLabel
    );
    if (rec) {
      rec.teacher_name = normalizedTeacher;
      rec.status = status as AttendanceRecord['status'];
      if (noteText) rec.notes = noteText;
      rec.recorded_by = currentUser.id;
      rec.updated_at = now;
    } else {
      rec = {
        id: db.nextIds.attendance++,
        student_id: sid,
        class_id: st.class_id,
        class_label: normalizedClassLabel,
        subject: normalizedSubject,
        teacher_name: normalizedTeacher,
        date,
        session_type: normalizedSession,
        status: status as AttendanceRecord['status'],
        notes: noteText,
        recorded_by: currentUser.id,
        updated_at: now,
      };
      db.attendance.push(rec);
    }
    saveDb(db);
    return { ok: true, record: { ...rec, recorded_by_name: currentUser.full_name } } as T;
  }

  if (pathname === '/api/attendance/reset' && method === 'POST') {
    const scope = String(body.scope || '');
    const validScopes = ['daily_session', 'daily_all', 'monthly_session', 'all'];
    if (!validScopes.includes(scope)) throw new LocalApiError('Jenis reset absensi tidak valid.', 400);

    const before = db.attendance.length;
    if (scope === 'all') {
      db.attendance = [];
    } else if (scope === 'daily_session') {
      if (!body.date) throw new LocalApiError('Tanggal wajib diisi untuk reset sesi harian.', 400);
      const d = String(body.date);
      const sess = normalizeSession(body.session_type);
      const cl = body.class_label && body.class_label !== 'all' ? String(body.class_label) : null;
      const sub = body.subject && body.subject !== 'all' ? normalizeSubject(body.subject) : null;
      db.attendance = db.attendance.filter(
        (a) => !(a.date === d && a.session_type === sess && (!cl || a.class_label === cl) && (!sub || a.subject === sub))
      );
    } else if (scope === 'daily_all') {
      if (!body.date) throw new LocalApiError('Tanggal wajib diisi untuk reset absensi harian.', 400);
      const d = String(body.date);
      const cl = body.class_label && body.class_label !== 'all' ? String(body.class_label) : null;
      const sub = body.subject && body.subject !== 'all' ? normalizeSubject(body.subject) : null;
      db.attendance = db.attendance.filter(
        (a) => !(a.date === d && (!cl || a.class_label === cl) && (!sub || a.subject === sub))
      );
    } else if (scope === 'monthly_session') {
      if (!body.month) throw new LocalApiError('Bulan wajib diisi untuk reset matriks bulanan.', 400);
      const m = String(body.month);
      const sess = normalizeSession(body.session_type);
      const cl = body.class_label && body.class_label !== 'all' ? String(body.class_label) : null;
      const sub = body.subject && body.subject !== 'all' ? normalizeSubject(body.subject) : null;
      db.attendance = db.attendance.filter(
        (a) => !(a.date.startsWith(m) && a.session_type === sess && (!cl || a.class_label === cl) && (!sub || a.subject === sub))
      );
    }
    const deleted = before - db.attendance.length;
    saveDb(db);
    return { ok: true, deleted } as T;
  }

  if (pathname === '/api/attendance/recap' && method === 'GET') {
    const targetMode = query.get('mode') === 'monthly' ? 'monthly' : 'daily';
    const date = query.get('date') || getTodayStr();
    const month = query.get('month');
    const classLabel = query.get('classLabel');
    const subject = query.get('subject');
    const teacherName = query.get('teacherName');
    const sessionType = query.get('sessionType');

    const activeStudents = db.students
      .filter((s) => s.status === 'Aktif')
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    const filteredRecords = db.attendance
      .filter((a) => {
        if (targetMode === 'daily') {
          if (a.date !== date) return false;
        } else if (month && month !== 'all') {
          if (!a.date.startsWith(month)) return false;
        }
        if (classLabel && classLabel !== 'all' && a.class_label !== classLabel) return false;
        if (subject && subject !== 'all' && a.subject !== normalizeSubject(subject)) return false;
        if (teacherName && teacherName !== 'all' && a.teacher_name !== teacherName) return false;
        if (sessionType && sessionType !== 'all' && a.session_type !== normalizeSession(sessionType)) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.updated_at.localeCompare(b.updated_at));

    let totalH = 0, totalS = 0, totalI = 0, totalHd = 0, totalA = 0;
    const byStudent = new Map<
      number,
      { hadir: number; sakit: number; izin: number; haid: number; alpha: number; sessions: Record<string, AttendanceRecord['status'] | ''> }
    >();

    for (const r of filteredRecords) {
      let agg = byStudent.get(r.student_id);
      if (!agg) {
        agg = {
          hadir: 0,
          sakit: 0,
          izin: 0,
          haid: 0,
          alpha: 0,
          sessions: { Subuh: '', Zuhur: '', Asar: '', Magrib: '', Isya: '' },
        };
        byStudent.set(r.student_id, agg);
      }
      if (r.status === 'H') { agg.hadir++; totalH++; }
      else if (r.status === 'S') { agg.sakit++; totalS++; }
      else if (r.status === 'I') { agg.izin++; totalI++; }
      else if (r.status === 'HD') { agg.haid++; totalHd++; }
      else if (r.status === 'A') { agg.alpha++; totalA++; }

      if ((VALID_SESSIONS as readonly string[]).includes(r.session_type)) {
        agg.sessions[r.session_type] = r.status;
      }
    }

    const rows = activeStudents.map((st) => {
      const agg = byStudent.get(st.id) || {
        hadir: 0,
        sakit: 0,
        izin: 0,
        haid: 0,
        alpha: 0,
        sessions: { Subuh: '', Zuhur: '', Asar: '', Magrib: '', Isya: '' },
      };
      const total_sessions = agg.hadir + agg.sakit + agg.izin + agg.haid + agg.alpha;
      const attendance_rate = total_sessions > 0 ? Math.round((agg.hadir / total_sessions) * 1000) / 10 : 0;
      return {
        student_id: st.id,
        nis: st.nis,
        full_name: st.full_name,
        gender: st.gender,
        class_name: classNameMap.get(st.class_id) || 'Kelas Diniyah',
        status: st.status,
        ...agg,
        total_sessions,
        attendance_rate,
      };
    });

    const total_records = totalH + totalS + totalI + totalHd + totalA;
    const overall_rate = total_records > 0 ? Math.round((totalH / total_records) * 1000) / 10 : 0;

    return {
      rows,
      summary: {
        hadir: totalH,
        sakit: totalS,
        izin: totalI,
        haid: totalHd,
        alpha: totalA,
        total_records,
        attendance_rate: overall_rate,
      },
    } as T;
  }

  // --- RECAP PER SANTRI ---
  if (pathname === '/api/recap' && method === 'GET') {
    const dateParam = query.get('date');
    const monthParam = query.get('month');
    const classId = query.get('classId');
    const classLabel = query.get('classLabel');
    const subject = query.get('subject');
    const teacherName = query.get('teacherName');
    const sessionType = query.get('sessionType');

    const dateFilter = dateParam && dateParam !== 'all' ? dateParam : '';
    const monthFilter = !dateFilter && monthParam && monthParam !== 'all' ? monthParam : '';
    const sessionFilter = sessionType && sessionType !== 'all' ? normalizeSession(sessionType) : '';
    const classLabelFilter = classLabel && classLabel !== 'all' ? classLabel : '';
    const subjectFilter = subject && subject !== 'all' ? normalizeSubject(subject) : '';
    const teacherFilter = teacherName && teacherName !== 'all' ? teacherName : '';

    const students = db.students
      .filter((s) => !classId || classId === 'all' || s.class_id === Number(classId))
      .map((s) => ({ ...s, class_name: classNameMap.get(s.class_id) || '' }))
      .sort((a, b) => a.class_name.localeCompare(b.class_name) || a.full_name.localeCompare(b.full_name));

    const recap = students.map((st) => {
      let hadir = 0, sakit = 0, izin = 0, haid = 0, alpha = 0;
      for (const a of db.attendance) {
        if (a.student_id !== st.id) continue;
        if (dateFilter && a.date !== dateFilter) continue;
        else if (monthFilter && !a.date.startsWith(monthFilter)) continue;
        if (sessionFilter && a.session_type !== sessionFilter) continue;
        if (classLabelFilter && a.class_label !== classLabelFilter) continue;
        if (subjectFilter && a.subject !== subjectFilter) continue;
        if (teacherFilter && a.teacher_name !== teacherFilter) continue;
        if (a.status === 'H') hadir++;
        else if (a.status === 'S') sakit++;
        else if (a.status === 'I') izin++;
        else if (a.status === 'HD') haid++;
        else if (a.status === 'A') alpha++;
      }
      const total_days = hadir + sakit + izin + haid + alpha;
      const attendance_rate = total_days > 0 ? Math.round((hadir / total_days) * 1000) / 10 : 0;

      let hafalan_count = 0, hafalan_ayat = 0, murojaah_count = 0, murojaah_ayat = 0;
      for (const m of db.memorization_logs) {
        if (m.student_id !== st.id) continue;
        if (dateFilter && m.date !== dateFilter) continue;
        else if (monthFilter && !m.date.startsWith(monthFilter)) continue;
        if (m.type === 'hafalan') {
          hafalan_count++;
          hafalan_ayat += m.total_ayat || 0;
        } else {
          murojaah_count++;
          murojaah_ayat += m.total_ayat || 0;
        }
      }

      const lastLog = db.memorization_logs
        .filter((m) => m.student_id === st.id && m.type === 'hafalan')
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0];

      return {
        student_id: st.id,
        nis: st.nis,
        full_name: st.full_name,
        gender: st.gender,
        class_id: st.class_id,
        class_name: st.class_name,
        status: st.status,
        target_juz: st.target_juz,
        hadir,
        sakit,
        izin,
        haid,
        alpha,
        total_days,
        attendance_rate,
        hafalan_count,
        hafalan_ayat,
        murojaah_count,
        murojaah_ayat,
        last_surah: lastLog ? lastLog.surah_name : null,
        last_ayat: lastLog ? `${lastLog.ayat_start}-${lastLog.ayat_end}` : null,
      };
    });

    return { recap } as T;
  }

  // --- MEMORIZATION ---
  if (pathname === '/api/memorization' && method === 'GET') {
    const studentId = query.get('studentId');
    const classId = query.get('classId');
    const type = query.get('type');
    const month = query.get('month');
    const search = (query.get('search') || '').trim().toLowerCase();

    const logs = db.memorization_logs
      .filter((m) => {
        const st = studentMap.get(m.student_id);
        if (!st) return false;
        if (studentId && studentId !== 'all' && m.student_id !== Number(studentId)) return false;
        if (classId && classId !== 'all' && st.class_id !== Number(classId)) return false;
        if (type && type !== 'all' && m.type !== type) return false;
        if (month && month !== 'all' && !m.date.startsWith(month)) return false;
        if (search) {
          const hit =
            st.full_name.toLowerCase().includes(search) ||
            st.nis.toLowerCase().includes(search) ||
            m.surah_name.toLowerCase().includes(search) ||
            m.notes.toLowerCase().includes(search);
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .map((m) => {
        const st = studentMap.get(m.student_id);
        return {
          ...m,
          student_name: st?.full_name || '',
          student_nis: st?.nis || '',
          class_id: st?.class_id,
          class_name: st ? classNameMap.get(st.class_id) || '' : '',
          ustaz_name: m.ustaz_id ? userNameMap.get(m.ustaz_id) || null : null,
        };
      });

    return { logs } as T;
  }

  if (pathname === '/api/memorization' && method === 'POST') {
    const studentId = Number(body.student_id);
    const type = body.type as 'hafalan' | 'murojaah';
    const date = String(body.date || '');
    const surahNumber = Number(body.surah_number);
    const surahName = String(body.surah_name || '').trim();
    const aStart = Number(body.ayat_start);
    const aEnd = Number(body.ayat_end);

    if (!studentId || !['hafalan', 'murojaah'].includes(type) || !date || !surahNumber || !surahName) {
      throw new LocalApiError('Santri, jenis setoran, tanggal, dan surah wajib diisi.', 400);
    }
    if (!aStart || !aEnd || aEnd < aStart) {
      throw new LocalApiError('Rentang ayat tidak valid (ayat akhir harus >= ayat awal).', 400);
    }

    const st = studentMap.get(studentId);
    const created: MemorizationLog = {
      id: db.nextIds.memorization++,
      student_id: studentId,
      type,
      date,
      juz: Number(body.juz) || 30,
      surah_number: surahNumber,
      surah_name: surahName,
      ayat_start: aStart,
      ayat_end: aEnd,
      total_ayat: aEnd - aStart + 1,
      quality: (VALID_GRADES as readonly string[]).includes(String(body.quality))
        ? (body.quality as MemorizationLog['quality'])
        : 'Jayyid Jiddan',
      murojaah_category: type === 'murojaah' ? String(body.murojaah_category || 'Manzil / Ulangan Pekanan') : '',
      notes: String(body.notes || '').trim(),
      ustaz_id: currentUser.id,
      created_at: new Date().toISOString(),
    };
    db.memorization_logs.push(created);
    saveDb(db);
    return {
      log: {
        ...created,
        student_name: st?.full_name || '',
        student_nis: st?.nis || '',
        class_id: st?.class_id,
        class_name: st ? classNameMap.get(st.class_id) || '' : '',
        ustaz_name: currentUser.full_name,
      },
    } as T;
  }

  const memMatch = pathname.match(/^\/api\/memorization\/(\d+)$/);
  if (memMatch && method === 'PUT') {
    const id = Number(memMatch[1]);
    const target = db.memorization_logs.find((m) => m.id === id);
    if (!target) throw new LocalApiError('Catatan tidak ditemukan.', 404);
    const aStart = body.ayat_start !== undefined ? Number(body.ayat_start) : target.ayat_start;
    const aEnd = body.ayat_end !== undefined ? Number(body.ayat_end) : target.ayat_end;
    if (aEnd < aStart) throw new LocalApiError('Rentang ayat tidak valid.', 400);
    if (body.student_id !== undefined) target.student_id = Number(body.student_id);
    if (body.type === 'hafalan' || body.type === 'murojaah') target.type = body.type;
    if (body.date !== undefined) target.date = String(body.date);
    if (body.juz !== undefined) target.juz = Number(body.juz);
    if (body.surah_number !== undefined) target.surah_number = Number(body.surah_number);
    if (body.surah_name !== undefined) target.surah_name = String(body.surah_name).trim();
    target.ayat_start = aStart;
    target.ayat_end = aEnd;
    target.total_ayat = aEnd - aStart + 1;
    if ((VALID_GRADES as readonly string[]).includes(String(body.quality))) {
      target.quality = body.quality as MemorizationLog['quality'];
    }
    if (body.murojaah_category !== undefined) target.murojaah_category = String(body.murojaah_category);
    if (body.notes !== undefined) target.notes = String(body.notes).trim();
    saveDb(db);
    const st = studentMap.get(target.student_id);
    return {
      log: {
        ...target,
        student_name: st?.full_name || '',
        student_nis: st?.nis || '',
        class_id: st?.class_id,
        class_name: st ? classNameMap.get(st.class_id) || '' : '',
        ustaz_name: target.ustaz_id ? userNameMap.get(target.ustaz_id) || null : null,
      },
    } as T;
  }

  if (memMatch && method === 'DELETE') {
    const id = Number(memMatch[1]);
    const before = db.memorization_logs.length;
    db.memorization_logs = db.memorization_logs.filter((m) => m.id !== id);
    if (db.memorization_logs.length === before) throw new LocalApiError('Catatan tidak ditemukan.', 404);
    saveDb(db);
    return { ok: true } as T;
  }

  if (pathname === '/api/memorization/reset' && method === 'POST') {
    const deleted = db.memorization_logs.length;
    db.memorization_logs = [];
    saveDb(db);
    return { ok: true, deleted } as T;
  }

  // --- KITAB KUNING ---
  if (pathname === '/api/kitab-kuning' && method === 'GET') {
    const studentId = query.get('studentId');
    const classId = query.get('classId');
    const month = query.get('month');
    const fan = query.get('fan');
    const search = (query.get('search') || '').trim().toLowerCase();

    const logs = db.kitab_kuning_logs
      .filter((k) => {
        const st = studentMap.get(k.student_id);
        if (!st) return false;
        if (studentId && studentId !== 'all' && k.student_id !== Number(studentId)) return false;
        if (classId && classId !== 'all' && st.class_id !== Number(classId)) return false;
        if (month && month !== 'all' && !k.date.startsWith(month)) return false;
        if (fan && fan !== 'all' && k.fan_ilmu !== fan) return false;
        if (search) {
          const hit =
            st.full_name.toLowerCase().includes(search) ||
            st.nis.toLowerCase().includes(search) ||
            k.kitab_name.toLowerCase().includes(search) ||
            k.chapter_or_bab.toLowerCase().includes(search) ||
            k.notes.toLowerCase().includes(search);
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .map((k) => {
        const st = studentMap.get(k.student_id);
        return {
          ...k,
          student_name: st?.full_name || '',
          student_nis: st?.nis || '',
          class_id: st?.class_id,
          class_name: st ? classNameMap.get(st.class_id) || '' : '',
          ustaz_name: k.ustaz_id ? userNameMap.get(k.ustaz_id) || null : null,
        };
      });

    return { logs } as T;
  }

  if (pathname === '/api/kitab-kuning' && method === 'POST') {
    const date = String(body.date || '');
    const kitabName = String(body.kitab_name || '').trim();
    const applyAll = Boolean(body.apply_to_all_active);
    const sid = Number(body.student_id);
    if (!date || !kitabName) throw new LocalApiError('Tanggal dan nama kitab wajib diisi.', 400);
    if (!applyAll && !sid) throw new LocalApiError('Pilih santri atau centang catat untuk seluruh santri aktif.', 400);

    const normalizedMethod = (VALID_KITAB_METHODS as readonly string[]).includes(String(body.method))
      ? (body.method as KitabKuningLog['method'])
      : 'Bandongan';
    const normalizedGrade = (VALID_GRADES as readonly string[]).includes(String(body.grade))
      ? (body.grade as KitabKuningLog['grade'])
      : 'Jayyid Jiddan';
    const now = new Date().toISOString();

    const targets = applyAll ? db.students.filter((s) => s.status === 'Aktif').map((s) => s.id) : [sid];
    let lastCreated: KitabKuningLog | null = null;
    for (const targetSid of targets) {
      lastCreated = {
        id: db.nextIds.kitab++,
        student_id: targetSid,
        date,
        kitab_name: kitabName,
        fan_ilmu: String(body.fan_ilmu || 'Fiqih').trim(),
        method: normalizedMethod,
        chapter_or_bab: String(body.chapter_or_bab || '').trim(),
        grade: normalizedGrade,
        notes: String(body.notes || '').trim(),
        ustaz_id: currentUser.id,
        created_at: now,
      };
      db.kitab_kuning_logs.push(lastCreated);
    }
    saveDb(db);
    const st = lastCreated ? studentMap.get(lastCreated.student_id) : undefined;
    return {
      log: lastCreated
        ? {
            ...lastCreated,
            student_name: st?.full_name || '',
            student_nis: st?.nis || '',
            class_id: st?.class_id,
            class_name: st ? classNameMap.get(st.class_id) || '' : '',
            ustaz_name: currentUser.full_name,
          }
        : null,
      count: targets.length,
    } as T;
  }

  const kitabMatch = pathname.match(/^\/api\/kitab-kuning\/(\d+)$/);
  if (kitabMatch && method === 'PUT') {
    const id = Number(kitabMatch[1]);
    const target = db.kitab_kuning_logs.find((k) => k.id === id);
    if (!target) throw new LocalApiError('Catatan Kitab Kuning tidak ditemukan.', 404);
    if (body.student_id !== undefined) target.student_id = Number(body.student_id);
    if (body.date !== undefined) target.date = String(body.date);
    if (body.kitab_name !== undefined) target.kitab_name = String(body.kitab_name).trim();
    if (body.fan_ilmu !== undefined) target.fan_ilmu = String(body.fan_ilmu).trim();
    if ((VALID_KITAB_METHODS as readonly string[]).includes(String(body.method))) {
      target.method = body.method as KitabKuningLog['method'];
    }
    if (body.chapter_or_bab !== undefined) target.chapter_or_bab = String(body.chapter_or_bab).trim();
    if ((VALID_GRADES as readonly string[]).includes(String(body.grade))) {
      target.grade = body.grade as KitabKuningLog['grade'];
    }
    if (body.notes !== undefined) target.notes = String(body.notes).trim();
    saveDb(db);
    const st = studentMap.get(target.student_id);
    return {
      log: {
        ...target,
        student_name: st?.full_name || '',
        student_nis: st?.nis || '',
        class_id: st?.class_id,
        class_name: st ? classNameMap.get(st.class_id) || '' : '',
        ustaz_name: target.ustaz_id ? userNameMap.get(target.ustaz_id) || null : null,
      },
    } as T;
  }

  if (kitabMatch && method === 'DELETE') {
    const id = Number(kitabMatch[1]);
    const before = db.kitab_kuning_logs.length;
    db.kitab_kuning_logs = db.kitab_kuning_logs.filter((k) => k.id !== id);
    if (db.kitab_kuning_logs.length === before) throw new LocalApiError('Catatan Kitab Kuning tidak ditemukan.', 404);
    saveDb(db);
    return { ok: true } as T;
  }

  if (pathname === '/api/kitab-kuning/reset' && method === 'POST') {
    const deleted = db.kitab_kuning_logs.length;
    db.kitab_kuning_logs = [];
    saveDb(db);
    return { ok: true, deleted } as T;
  }

  if (pathname === '/api/data/reset-logs' && method === 'POST') {
    const includeKitab = Boolean(body.include_kitab);
    const attCount = db.attendance.length;
    const memCount = db.memorization_logs.length;
    const kitabCount = includeKitab ? db.kitab_kuning_logs.length : 0;
    db.attendance = [];
    db.memorization_logs = [];
    if (includeKitab) db.kitab_kuning_logs = [];
    saveDb(db);
    return { ok: true, deleted: { attendance: attCount, memorization_logs: memCount, kitab_kuning_logs: kitabCount } } as T;
  }

  // --- DASHBOARD ---
  if (pathname === '/api/dashboard' && method === 'GET') {
    const today = getTodayStr();
    const currentMonth = today.slice(0, 7);
    const activeIds = new Set(db.students.filter((s) => s.status === 'Aktif').map((s) => s.id));

    let hadir = 0, sakit = 0, izin = 0, haid = 0, alpha = 0;
    const recordedSet = new Set<number>();
    for (const a of db.attendance) {
      if (a.date !== today || !activeIds.has(a.student_id)) continue;
      recordedSet.add(a.student_id);
      if (a.status === 'H') hadir++;
      else if (a.status === 'S') sakit++;
      else if (a.status === 'I') izin++;
      else if (a.status === 'HD') haid++;
      else if (a.status === 'A') alpha++;
    }
    const unrecorded = Math.max(0, activeIds.size - recordedSet.size);

    let month_hafalan_count = 0, month_hafalan_ayat = 0, month_murojaah_count = 0, month_murojaah_ayat = 0;
    for (const m of db.memorization_logs) {
      if (!m.date.startsWith(currentMonth)) continue;
      if (m.type === 'hafalan') {
        month_hafalan_count++;
        month_hafalan_ayat += m.total_ayat || 0;
      } else {
        month_murojaah_count++;
        month_murojaah_ayat += m.total_ayat || 0;
      }
    }

    const class_breakdown = [...db.classes]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => {
        const classStudents = db.students.filter((s) => s.class_id === c.id);
        const classActiveCount = classStudents.filter((s) => s.status === 'Aktif').length;
        const classStudentIds = new Set(classStudents.map((s) => s.id));
        const todayHadirIds = new Set<number>();
        for (const a of db.attendance) {
          if (a.date === today && a.status === 'H' && classStudentIds.has(a.student_id)) {
            todayHadirIds.add(a.student_id);
          }
        }
        const monthHafalan = db.memorization_logs.filter(
          (m) => m.date.startsWith(currentMonth) && m.type === 'hafalan' && classStudentIds.has(m.student_id)
        ).length;

        return {
          id: c.id,
          name: c.name,
          level: c.level,
          ustaz_name: c.ustaz_id ? userNameMap.get(c.ustaz_id) || null : null,
          student_count: classActiveCount,
          today_hadir: todayHadirIds.size,
          month_hafalan: monthHafalan,
        };
      });

    const recent_logs = [...db.memorization_logs]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .slice(0, 8)
      .map((m) => {
        const st = studentMap.get(m.student_id);
        return {
          ...m,
          student_name: st?.full_name || '',
          student_nis: st?.nis || '',
          class_id: st?.class_id,
          class_name: st ? classNameMap.get(st.class_id) || '' : '',
          ustaz_name: m.ustaz_id ? userNameMap.get(m.ustaz_id) || null : null,
        };
      });

    const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const fmtDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const [ty, tm, td] = today.split('-').map(Number);
    const todayDate = new Date(ty, tm - 1, td);
    const dayOffsetFromMon = (todayDate.getDay() + 6) % 7;
    const currentMonday = new Date(ty, tm - 1, td - dayOffsetFromMon);

    const weeklyBuckets: Array<MemorizationTrendPoint & { start: string; end: string }> = [];
    for (let i = 7; i >= 0; i--) {
      const ws = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() - i * 7);
      const we = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6);
      const start = fmtDate(ws);
      const end = fmtDate(we);
      const label =
        ws.getMonth() === we.getMonth()
          ? `${ws.getDate()}–${we.getDate()} ${MONTHS_ID[we.getMonth()]}`
          : `${ws.getDate()} ${MONTHS_ID[ws.getMonth()]}–${we.getDate()} ${MONTHS_ID[we.getMonth()]}`;
      weeklyBuckets.push({
        period: start,
        label,
        start,
        end,
        hafalan_count: 0,
        hafalan_ayat: 0,
        murojaah_count: 0,
        murojaah_ayat: 0,
      });
    }

    const monthlyBuckets: MemorizationTrendPoint[] = [];
    for (let i = 5; i >= 0; i--) {
      const md = new Date(ty, tm - 1 - i, 1);
      const ym = `${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, '0')}`;
      monthlyBuckets.push({
        period: ym,
        label: `${MONTHS_ID[md.getMonth()]} ${String(md.getFullYear()).slice(-2)}`,
        hafalan_count: 0,
        hafalan_ayat: 0,
        murojaah_count: 0,
        murojaah_ayat: 0,
      });
    }

    const monthMap = new Map(monthlyBuckets.map((b) => [b.period, b]));
    for (const log of db.memorization_logs) {
      const ayat = Number(log.total_ayat || 0);
      const mb = monthMap.get(log.date.slice(0, 7));
      if (mb) {
        if (log.type === 'hafalan') { mb.hafalan_count += 1; mb.hafalan_ayat += ayat; }
        else { mb.murojaah_count += 1; mb.murojaah_ayat += ayat; }
      }
      for (const wb of weeklyBuckets) {
        if (log.date >= wb.start && log.date <= wb.end) {
          if (log.type === 'hafalan') { wb.hafalan_count += 1; wb.hafalan_ayat += ayat; }
          else { wb.murojaah_count += 1; wb.murojaah_ayat += ayat; }
          break;
        }
      }
    }

    const target_alerts: TargetJuzAlert[] = [];
    for (const st of db.students) {
      if (st.status !== 'Aktif' || st.target_juz <= 0) continue;
      const stLogs = db.memorization_logs
        .filter((m) => m.student_id === st.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      const hafalanAyat = stLogs
        .filter((m) => m.type === 'hafalan')
        .reduce((sum, m) => sum + (m.total_ayat || 0), 0);
      const currentJuz = Math.min(30, Math.round((Number(st.initial_juz || 0) + hafalanAyat / 208) * 10) / 10);
      const remainingJuz = Math.max(0, Math.round((st.target_juz - currentJuz) * 10) / 10);
      const progressPct = Math.round((currentJuz / st.target_juz) * 1000) / 10;

      if (currentJuz >= st.target_juz) {
        target_alerts.push({
          student_id: st.id,
          nis: st.nis,
          full_name: st.full_name,
          class_name: classNameMap.get(st.class_id) || '-',
          initial_juz: st.initial_juz,
          target_juz: st.target_juz,
          hafalan_ayat: hafalanAyat,
          current_juz: currentJuz,
          remaining_juz: 0,
          progress_pct: progressPct,
          status: 'tercapai',
          last_surah: stLogs[0]?.surah_name || null,
          last_date: stLogs[0]?.date || null,
        });
      } else if (currentJuz > 0 && (progressPct >= 80 || remainingJuz <= 1.5)) {
        target_alerts.push({
          student_id: st.id,
          nis: st.nis,
          full_name: st.full_name,
          class_name: classNameMap.get(st.class_id) || '-',
          initial_juz: st.initial_juz,
          target_juz: st.target_juz,
          hafalan_ayat: hafalanAyat,
          current_juz: currentJuz,
          remaining_juz: remainingJuz,
          progress_pct: progressPct,
          status: 'mendekati',
          last_surah: stLogs[0]?.surah_name || null,
          last_date: stLogs[0]?.date || null,
        });
      }
    }

    target_alerts.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'tercapai' ? -1 : 1;
      if (b.progress_pct !== a.progress_pct) return b.progress_pct - a.progress_pct;
      return a.full_name.localeCompare(b.full_name);
    });

    const summary: DashboardSummary = {
      total_students: db.students.length,
      active_students: activeIds.size,
      total_classes: db.classes.length,
      today,
      today_attendance: { hadir, sakit, izin, haid, alpha, unrecorded },
      month_hafalan_count,
      month_hafalan_ayat,
      month_murojaah_count,
      month_murojaah_ayat,
      class_breakdown,
      recent_logs,
      memorization_trends: {
        weekly: weeklyBuckets.map(({ start: _s, end: _e, ...rest }) => rest),
        monthly: monthlyBuckets,
      },
      target_alerts,
    };

    return summary as T;
  }

  // --- BACKUP & SNAPSHOTS ---
  if (pathname === '/api/backup/snapshots' && method === 'GET') {
    const snapshots = db.snapshots.map(({ content: _c, ...meta }) => meta);
    return { snapshots } as T;
  }

  if (pathname === '/api/backup/snapshots' && method === 'POST') {
    const label = String(body.label || 'manual').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 30) || 'backup';
    const createdAt = new Date().toISOString();
    const filename = `backup-${createdAt.replace(/[:.]/g, '-')}-${label}.json`;
    const payload = {
      version: '1.0.0',
      exported_at: createdAt,
      exported_by: `user-${currentUser.id}`,
      tables: {
        settings: Object.entries(db.settings).map(([key, value]) => ({ key, value })),
        users: db.users,
        classes: db.classes,
        students: db.students,
        attendance: db.attendance,
        memorization_logs: db.memorization_logs,
        kitab_kuning_logs: db.kitab_kuning_logs,
      },
    };
    const content = JSON.stringify(payload, null, 2);
    const snap: StoredSnapshot = {
      filename,
      size_bytes: new Blob([content]).size,
      created_at: createdAt,
      content,
    };
    db.snapshots.unshift(snap);
    saveDb(db);
    return { snapshot: { filename: snap.filename, size_bytes: snap.size_bytes, created_at: snap.created_at } } as T;
  }

  if (pathname === '/api/backup/restore' && method === 'POST') {
    requireLocalAdmin(currentUser);
    const tables = body.tables as Record<string, unknown[]> | undefined;
    if (!tables || !Array.isArray(tables.students) || !Array.isArray(tables.classes)) {
      throw new LocalApiError('Format file backup tidak valid.', 400);
    }
    if (Array.isArray(tables.settings)) {
      const nextSettings: Record<string, string> = {};
      for (const s of tables.settings as Array<{ key: string; value: string }>) {
        if (s.key) nextSettings[s.key] = String(s.value || '');
      }
      db.settings = nextSettings;
    }
    db.classes = tables.classes as ClassItem[];
    db.students = tables.students as Student[];
    db.attendance = (tables.attendance || []) as AttendanceRecord[];
    db.memorization_logs = (tables.memorization_logs || []) as MemorizationLog[];
    db.kitab_kuning_logs = (tables.kitab_kuning_logs || []) as KitabKuningLog[];
    if (Array.isArray(tables.users) && tables.users.length > 0) {
      db.users = (tables.users as Array<Record<string, unknown>>).map((u) => ({
        id: Number(u.id),
        username: String(u.username),
        full_name: String(u.full_name),
        role: u.role === 'ustaz' ? 'ustaz' : 'admin',
        nip_or_kode: String(u.nip_or_kode || ''),
        phone: String(u.phone || ''),
        password: String(u.password || (u.role === 'ustaz' ? 'ustaz123' : 'admin123')),
        is_active: Number(u.is_active ?? 1),
        created_at: String(u.created_at || new Date().toISOString()),
      }));
    }
    saveDb(db);
    return {
      ok: true,
      restored: {
        classes: db.classes.length,
        students: db.students.length,
        attendance: db.attendance.length,
        memorization_logs: db.memorization_logs.length,
      },
    } as T;
  }

  const snapRestoreMatch = pathname.match(/^\/api\/backup\/snapshots\/([^/]+)\/restore$/);
  if (snapRestoreMatch && method === 'POST') {
    requireLocalAdmin(currentUser);
    const filename = decodeURIComponent(snapRestoreMatch[1]);
    const snap = db.snapshots.find((s) => s.filename === filename);
    if (!snap) throw new LocalApiError('Snapshot tidak ditemukan.', 404);
    const parsed = JSON.parse(snap.content) as Record<string, unknown>;
    return handleLocalNetlifyApi<T>('/api/backup/restore', { method: 'POST', body: JSON.stringify(parsed) }, token);
  }

  const snapDeleteMatch = pathname.match(/^\/api\/backup\/snapshots\/([^/]+)$/);
  if (snapDeleteMatch && method === 'DELETE') {
    requireLocalAdmin(currentUser);
    const filename = decodeURIComponent(snapDeleteMatch[1]);
    const before = db.snapshots.length;
    db.snapshots = db.snapshots.filter((s) => s.filename !== filename);
    if (db.snapshots.length === before) throw new LocalApiError('Snapshot tidak ditemukan.', 404);
    saveDb(db);
    return { ok: true } as T;
  }

  throw new LocalApiError(`Endpoint tidak ditemukan: ${pathname}`, 404);
}

export function handleLocalNetlifyDownload(path: string, fallbackFilename: string, token: string | null): void {
  const db = loadDb();
  const user = requireLocalUser(db, token);

  let content = '';
  let filename = fallbackFilename;

  if (path === '/api/backup/export') {
    const payload = {
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      exported_by: user.username,
      tables: {
        settings: Object.entries(db.settings).map(([key, value]) => ({ key, value })),
        users: db.users,
        classes: db.classes,
        students: db.students,
        attendance: db.attendance,
        memorization_logs: db.memorization_logs,
        kitab_kuning_logs: db.kitab_kuning_logs,
      },
    };
    content = JSON.stringify(payload, null, 2);
    filename = `tahfidztrack-backup-${getTodayStr()}.json`;
  } else {
    const dlMatch = path.match(/^\/api\/backup\/snapshots\/([^/]+)\/download$/);
    if (!dlMatch) throw new LocalApiError('File tidak ditemukan.', 404);
    const name = decodeURIComponent(dlMatch[1]);
    const snap = db.snapshots.find((s) => s.filename === name);
    if (!snap) throw new LocalApiError('Snapshot tidak ditemukan.', 404);
    content = snap.content;
    filename = snap.filename;
  }

  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
