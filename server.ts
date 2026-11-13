import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  db,
  initDatabase,
  hashPassword,
  verifyPassword,
  buildFullBackup,
  createServerSnapshot,
  listServerSnapshots,
  getSnapshotPath,
  restoreFromBackup,
  type FullBackupPayload,
} from './server/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

initDatabase();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  const allowedOrigin = process.env.CORS_ORIGIN;
  if (
    origin &&
    (origin.endsWith('.netlify.app') ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      (allowedOrigin && origin === allowedOrigin))
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role: 'admin' | 'ustaz';
  nip_or_kode: string;
  phone: string;
  is_active: number;
  created_at: string;
}

interface AuthedRequest extends Request {
  user?: AuthUser;
  sessionToken?: string;
}

function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieToken = req.cookies?.tahfidz_session;
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  return null;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Sesi tidak ditemukan. Silakan login terlebih dahulu.' });
    return;
  }

  const row = db.prepare(`
    SELECT s.token, s.expires_at, u.id, u.username, u.full_name, u.role, u.nip_or_kode, u.phone, u.is_active, u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token) as (AuthUser & { token: string; expires_at: string }) | undefined;

  if (!row || new Date(row.expires_at).getTime() < Date.now() || row.is_active !== 1) {
    if (row) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    res.status(401).json({ error: 'Sesi telah berakhir atau akun nonaktif. Silakan login kembali.' });
    return;
  }

  req.user = {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    nip_or_kode: row.nip_or_kode,
    phone: row.phone,
    is_active: row.is_active,
    created_at: row.created_at,
  };
  req.sessionToken = token;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Akses ditolak. Fitur ini khusus Administrator.' });
    return;
  }
  next();
}

// --- AUTH ROUTES ---
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'Username dan password wajib diisi.' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim()) as
    | (AuthUser & { password_hash: string })
    | undefined;

  if (!user || !verifyPassword(String(password), user.password_hash)) {
    res.status(401).json({ error: 'Username atau password salah.' });
    return;
  }

  if (user.is_active !== 1) {
    res.status(403).json({ error: 'Akun Anda sedang dinonaktifkan oleh Admin.' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    token,
    user.id,
    expires.toISOString(),
    now.toISOString()
  );

  res.cookie('tahfidz_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  const safeUser: AuthUser = {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    nip_or_kode: user.nip_or_kode,
    phone: user.phone,
    is_active: user.is_active,
    created_at: user.created_at,
  };

  res.json({ user: safeUser, token });
});

app.post('/api/auth/quick-login', (req: Request, res: Response) => {
  const requestedRole = req.body?.role === 'ustaz' ? 'ustaz' : 'admin';

  let user = db
    .prepare('SELECT * FROM users WHERE role = ? AND is_active = 1 ORDER BY id ASC LIMIT 1')
    .get(requestedRole) as AuthUser | undefined;

  if (!user) {
    user = db
      .prepare('SELECT * FROM users WHERE is_active = 1 ORDER BY id ASC LIMIT 1')
      .get() as AuthUser | undefined;
  }

  if (!user) {
    res.status(404).json({ error: 'Tidak ada akun aktif yang tersedia.' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    token,
    user.id,
    expires.toISOString(),
    now.toISOString()
  );

  res.cookie('tahfidz_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  const safeUser: AuthUser = {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    nip_or_kode: user.nip_or_kode,
    phone: user.phone,
    is_active: user.is_active,
    created_at: user.created_at,
  };

  res.json({ user: safeUser, token });
});

app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res: Response) => {
  if (req.sessionToken) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
  }
  res.clearCookie('tahfidz_session', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
  res.json({ user: req.user });
});

app.post('/api/auth/change-password', requireAuth, (req: AuthedRequest, res: Response) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password || String(new_password).length < 6) {
    res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
    return;
  }

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(String(current_password), row.password_hash)) {
    res.status(400).json({ error: 'Password saat ini tidak sesuai.' });
    return;
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(new_password)), req.user!.id);
  res.json({ ok: true });
});

// --- USERS MANAGEMENT ---
app.get('/api/users', requireAuth, (_req: AuthedRequest, res: Response) => {
  const users = db
    .prepare('SELECT id, username, full_name, role, nip_or_kode, phone, is_active, created_at FROM users ORDER BY role ASC, full_name ASC')
    .all();
  res.json({ users });
});

app.post('/api/users', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  const { username, full_name, role, nip_or_kode, phone, password } = req.body || {};
  if (!username || !full_name || !password || !['admin', 'ustaz'].includes(role)) {
    res.status(400).json({ error: 'Username, nama lengkap, peran, dan password wajib diisi.' });
    return;
  }
  if (String(password).length < 6) {
    res.status(400).json({ error: 'Password minimal 6 karakter.' });
    return;
  }

  try {
    const now = new Date().toISOString();
    const result = db
      .prepare(`
        INSERT INTO users (username, full_name, role, nip_or_kode, phone, password_hash, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      `)
      .run(
        String(username).trim(),
        String(full_name).trim(),
        role,
        String(nip_or_kode || '').trim(),
        String(phone || '').trim(),
        hashPassword(String(password)),
        now
      );
    const created = db
      .prepare('SELECT id, username, full_name, role, nip_or_kode, phone, is_active, created_at FROM users WHERE id = ?')
      .get(result.lastInsertRowid);
    res.status(201).json({ user: created });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE')) {
      res.status(409).json({ error: 'Username sudah digunakan.' });
      return;
    }
    res.status(500).json({ error: 'Gagal menambahkan akun.' });
  }
});

app.put('/api/users/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  const targetId = Number(req.params.id);
  const { full_name, role, nip_or_kode, phone, is_active, password } = req.body || {};

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as AuthUser | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Akun tidak ditemukan.' });
    return;
  }

  if (targetId === req.user!.id && is_active === 0) {
    res.status(400).json({ error: 'Anda tidak dapat menonaktifkan akun yang sedang digunakan.' });
    return;
  }

  db.prepare(`
    UPDATE users
    SET full_name = ?, role = ?, nip_or_kode = ?, phone = ?, is_active = ?
    WHERE id = ?
  `).run(
    full_name !== undefined ? String(full_name).trim() : existing.full_name,
    role && ['admin', 'ustaz'].includes(role) ? role : existing.role,
    nip_or_kode !== undefined ? String(nip_or_kode).trim() : existing.nip_or_kode,
    phone !== undefined ? String(phone).trim() : existing.phone,
    is_active !== undefined ? (Number(is_active) ? 1 : 0) : existing.is_active,
    targetId
  );

  if (password && String(password).length >= 6) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(password)), targetId);
  }

  const updated = db
    .prepare('SELECT id, username, full_name, role, nip_or_kode, phone, is_active, created_at FROM users WHERE id = ?')
    .get(targetId);
  res.json({ user: updated });
});

app.delete('/api/users/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user!.id) {
    res.status(400).json({ error: 'Anda tidak dapat menghapus akun Anda sendiri.' });
    return;
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Akun tidak ditemukan.' });
    return;
  }
  res.json({ ok: true });
});

// --- INSTITUTION SETTINGS ---
app.get('/api/settings', requireAuth, (_req: AuthedRequest, res: Response) => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const settings: Record<string, string> = {};
  for (const r of rows) {
    settings[r.key] = r.value;
  }
  res.json({ settings });
});

app.put('/api/settings', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  const allowed = ['institution_name', 'institution_address', 'head_name', 'academic_year'];
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const body = req.body || {};
  for (const key of allowed) {
    if (body[key] !== undefined) {
      upsert.run(key, String(body[key]).trim());
    }
  }
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ settings });
});

// --- CLASSES ROUTES ---
app.get('/api/classes', requireAuth, (_req: AuthedRequest, res: Response) => {
  const classes = db
    .prepare(`
      SELECT c.*, u.full_name as ustaz_name,
        (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 'Aktif') as student_count
      FROM classes c
      LEFT JOIN users u ON u.id = c.ustaz_id
      ORDER BY c.name ASC
    `)
    .all();
  res.json({ classes });
});

app.post('/api/classes', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  const { name, level, ustaz_id, schedule, target_juz, room } = req.body || {};
  if (!name || !String(name).trim()) {
    res.status(400).json({ error: 'Nama kelas / halaqah wajib diisi.' });
    return;
  }

  const now = new Date().toISOString();
  const result = db
    .prepare(`
      INSERT INTO classes (name, level, ustaz_id, schedule, target_juz, room, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      String(name).trim(),
      String(level || 'Mutawassith').trim(),
      ustaz_id ? Number(ustaz_id) : null,
      String(schedule || "Ba'da Subuh & Ba'da Ashar").trim(),
      Number(target_juz) || 5,
      String(room || '').trim(),
      now
    );

  const created = db
    .prepare(`
      SELECT c.*, u.full_name as ustaz_name, 0 as student_count
      FROM classes c LEFT JOIN users u ON u.id = c.ustaz_id WHERE c.id = ?
    `)
    .get(result.lastInsertRowid);
  res.status(201).json({ classItem: created });
});

app.put('/api/classes/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM classes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Kelas tidak ditemukan.' });
    return;
  }

  const { name, level, ustaz_id, schedule, target_juz, room } = req.body || {};
  db.prepare(`
    UPDATE classes
    SET name = ?, level = ?, ustaz_id = ?, schedule = ?, target_juz = ?, room = ?
    WHERE id = ?
  `).run(
    name !== undefined ? String(name).trim() : existing.name,
    level !== undefined ? String(level).trim() : existing.level,
    ustaz_id !== undefined ? (ustaz_id ? Number(ustaz_id) : null) : existing.ustaz_id,
    schedule !== undefined ? String(schedule).trim() : existing.schedule,
    target_juz !== undefined ? Number(target_juz) : existing.target_juz,
    room !== undefined ? String(room).trim() : existing.room,
    id
  );

  const updated = db
    .prepare(`
      SELECT c.*, u.full_name as ustaz_name,
        (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 'Aktif') as student_count
      FROM classes c LEFT JOIN users u ON u.id = c.ustaz_id WHERE c.id = ?
    `)
    .get(id);
  res.json({ classItem: updated });
});

app.delete('/api/classes/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const studentCount = (db.prepare('SELECT COUNT(*) as c FROM students WHERE class_id = ?').get(id) as { c: number }).c;
  if (studentCount > 0) {
    res.status(400).json({ error: `Kelas masih memiliki ${studentCount} santri. Pindahkan santri terlebih dahulu.` });
    return;
  }
  const info = db.prepare('DELETE FROM classes WHERE id = ?').run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Kelas tidak ditemukan.' });
    return;
  }
  res.json({ ok: true });
});

// --- STUDENTS ROUTES ---
app.get('/api/students', requireAuth, (req: AuthedRequest, res: Response) => {
  const { classId, status, search } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (classId && classId !== 'all') {
    conditions.push('s.class_id = ?');
    params.push(Number(classId));
  }
  if (status && status !== 'all') {
    conditions.push('s.status = ?');
    params.push(String(status));
  }
  if (search && String(search).trim()) {
    conditions.push('(s.full_name LIKE ? OR s.nis LIKE ? OR s.guardian_name LIKE ?)');
    const q = `%${String(search).trim()}%`;
    params.push(q, q, q);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const students = db
    .prepare(`
      SELECT s.*, c.name as class_name
      FROM students s
      LEFT JOIN classes c ON c.id = s.class_id
      ${whereClause}
      ORDER BY c.name ASC, s.full_name ASC
    `)
    .all(...params) as Array<Record<string, unknown>>;

  const recentLogRows = db
    .prepare(`
      SELECT * FROM (
        SELECT
          m.*,
          u.full_name as ustaz_name,
          ROW_NUMBER() OVER (PARTITION BY m.student_id ORDER BY m.date DESC, m.id DESC) as rn
        FROM memorization_logs m
        LEFT JOIN users u ON u.id = m.ustaz_id
      ) ranked
      WHERE rn <= 5
      ORDER BY student_id ASC, date DESC, id DESC
    `)
    .all() as Array<Record<string, unknown>>;

  const logsByStudent = new Map<number, Array<Record<string, unknown>>>();
  for (const row of recentLogRows) {
    const sid = Number(row.student_id);
    const list = logsByStudent.get(sid) || [];
    const { rn: _rn, ...cleanRow } = row;
    list.push(cleanRow);
    logsByStudent.set(sid, list);
  }

  const enrichedStudents = students.map((s) => ({
    ...s,
    recent_logs: logsByStudent.get(Number(s.id)) || [],
  }));

  res.json({ students: enrichedStudents });
});

app.get('/api/students/:id/detail', requireAuth, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const student = db
    .prepare(`
      SELECT s.*, c.name as class_name
      FROM students s
      LEFT JOIN classes c ON c.id = s.class_id
      WHERE s.id = ?
    `)
    .get(id);

  if (!student) {
    res.status(404).json({ error: 'Santri tidak ditemukan.' });
    return;
  }

  const attendance = db
    .prepare(`
      SELECT a.*, u.full_name as recorded_by_name
      FROM attendance a
      LEFT JOIN users u ON u.id = a.recorded_by
      WHERE a.student_id = ?
      ORDER BY a.date DESC
      LIMIT 60
    `)
    .all(id);

  const logs = db
    .prepare(`
      SELECT m.*, u.full_name as ustaz_name
      FROM memorization_logs m
      LEFT JOIN users u ON u.id = m.ustaz_id
      WHERE m.student_id = ?
      ORDER BY m.date DESC, m.id DESC
      LIMIT 100
    `)
    .all(id);

  res.json({ student, attendance, logs });
});

app.post('/api/students', requireAuth, (req: AuthedRequest, res: Response) => {
  const {
    nis,
    full_name,
    gender,
    birth_place,
    birth_date,
    class_id,
    guardian_name,
    guardian_phone,
    address,
    entry_date,
    target_juz,
    initial_juz,
    status,
    notes,
  } = req.body || {};

  if (!nis || !full_name || !class_id) {
    res.status(400).json({ error: 'NIS, nama lengkap, dan kelas wajib diisi.' });
    return;
  }

  try {
    const now = new Date().toISOString();
    const resInsert = db
      .prepare(`
        INSERT INTO students (
          nis, full_name, gender, birth_place, birth_date, class_id,
          guardian_name, guardian_phone, address, entry_date, target_juz, initial_juz, status, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        String(nis).trim(),
        String(full_name).trim(),
        gender === 'P' ? 'P' : 'L',
        String(birth_place || '').trim(),
        String(birth_date || '').trim(),
        Number(class_id),
        String(guardian_name || '').trim(),
        String(guardian_phone || '').trim(),
        String(address || '').trim(),
        String(entry_date || getTodayStr()).trim(),
        Number(target_juz) || 30,
        Number(initial_juz) || 0,
        ['Aktif', 'Cuti', 'Lulus', 'Berhenti'].includes(status) ? status : 'Aktif',
        String(notes || '').trim(),
        now
      );

    const created = db
      .prepare('SELECT s.*, c.name as class_name FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?')
      .get(resInsert.lastInsertRowid);
    res.status(201).json({ student: created });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE')) {
      res.status(409).json({ error: 'NIS santri sudah terdaftar.' });
      return;
    }
    res.status(500).json({ error: 'Gagal menyimpan data santri.' });
  }
});

app.put('/api/students/:id', requireAuth, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Santri tidak ditemukan.' });
    return;
  }

  const b = req.body || {};
  try {
    db.prepare(`
      UPDATE students SET
        nis = ?, full_name = ?, gender = ?, birth_place = ?, birth_date = ?, class_id = ?,
        guardian_name = ?, guardian_phone = ?, address = ?, entry_date = ?,
        target_juz = ?, initial_juz = ?, status = ?, notes = ?
      WHERE id = ?
    `).run(
      b.nis !== undefined ? String(b.nis).trim() : existing.nis,
      b.full_name !== undefined ? String(b.full_name).trim() : existing.full_name,
      b.gender === 'P' || b.gender === 'L' ? b.gender : existing.gender,
      b.birth_place !== undefined ? String(b.birth_place).trim() : existing.birth_place,
      b.birth_date !== undefined ? String(b.birth_date).trim() : existing.birth_date,
      b.class_id !== undefined ? Number(b.class_id) : existing.class_id,
      b.guardian_name !== undefined ? String(b.guardian_name).trim() : existing.guardian_name,
      b.guardian_phone !== undefined ? String(b.guardian_phone).trim() : existing.guardian_phone,
      b.address !== undefined ? String(b.address).trim() : existing.address,
      b.entry_date !== undefined ? String(b.entry_date).trim() : existing.entry_date,
      b.target_juz !== undefined ? Number(b.target_juz) : existing.target_juz,
      b.initial_juz !== undefined ? Number(b.initial_juz) : existing.initial_juz,
      ['Aktif', 'Cuti', 'Lulus', 'Berhenti'].includes(b.status) ? b.status : existing.status,
      b.notes !== undefined ? String(b.notes).trim() : existing.notes,
      id
    );

    const updated = db
      .prepare('SELECT s.*, c.name as class_name FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?')
      .get(id);
    res.json({ student: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE')) {
      res.status(409).json({ error: 'NIS sudah digunakan oleh santri lain.' });
      return;
    }
    res.status(500).json({ error: 'Gagal memperbarui data santri.' });
  }
});

app.delete('/api/students/:id', requireAuth, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM students WHERE id = ?').run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Santri tidak ditemukan.' });
    return;
  }
  res.json({ ok: true });
});

// --- ATTENDANCE ROUTES ---
const VALID_SESSIONS = ['Subuh', 'Zuhur', 'Asar', 'Magrib', 'Isya'];
const VALID_SUBJECTS = ["Tahfidz Al Qur'an", 'Kitab Kuning'];

function normalizeSession(val: unknown): string {
  const s = String(val || 'Subuh').trim();
  return VALID_SESSIONS.includes(s) ? s : 'Subuh';
}

function normalizeSubject(val: unknown): string {
  const s = String(val || "Tahfidz Al Qur'an").trim();
  return VALID_SUBJECTS.includes(s) ? s : "Tahfidz Al Qur'an";
}

function normalizeClassLabel(val: unknown): string {
  const s = String(val || 'Kelas Diniyah').trim();
  return s || 'Kelas Diniyah';
}

function normalizeTeacherName(val: unknown): string {
  const s = String(val || 'Ustadz M Nabil Rosyadi Lc').trim();
  return s || 'Ustadz M Nabil Rosyadi Lc';
}

app.get('/api/attendance', requireAuth, (req: AuthedRequest, res: Response) => {
  const { date, month, classId, classLabel, subject, teacherName, sessionType } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (date) {
    conditions.push('a.date = ?');
    params.push(String(date));
  } else if (month) {
    conditions.push('a.date LIKE ?');
    params.push(`${String(month)}%`);
  }

  if (classId && classId !== 'all') {
    conditions.push('a.class_id = ?');
    params.push(Number(classId));
  }

  if (classLabel && classLabel !== 'all') {
    conditions.push('a.class_label = ?');
    params.push(String(classLabel));
  }

  if (subject && subject !== 'all') {
    conditions.push('a.subject = ?');
    params.push(normalizeSubject(subject));
  }

  if (teacherName && teacherName !== 'all') {
    conditions.push('a.teacher_name = ?');
    params.push(String(teacherName));
  }

  if (sessionType && sessionType !== 'all') {
    conditions.push('a.session_type = ?');
    params.push(normalizeSession(sessionType));
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const records = db
    .prepare(`
      SELECT a.*, u.full_name as recorded_by_name
      FROM attendance a
      LEFT JOIN users u ON u.id = a.recorded_by
      ${whereClause}
      ORDER BY a.date ASC, a.session_type ASC
    `)
    .all(...params);
  res.json({ records });
});

app.post('/api/attendance/bulk', requireAuth, (req: AuthedRequest, res: Response) => {
  const { date, session_type, class_label, subject, teacher_name, entries } = req.body || {};
  if (!date || !Array.isArray(entries)) {
    res.status(400).json({ error: 'Tanggal dan daftar absensi wajib dikirim.' });
    return;
  }

  const normalizedSession = normalizeSession(session_type);
  const normalizedClassLabel = normalizeClassLabel(class_label);
  const normalizedSubject = normalizeSubject(subject);
  const normalizedTeacher = normalizeTeacherName(teacher_name);
  const now = new Date().toISOString();

  const upsert = db.prepare(`
    INSERT INTO attendance (
      student_id, class_id, class_label, subject, teacher_name,
      date, session_type, status, notes, recorded_by, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_id, date, session_type, subject, class_label) DO UPDATE SET
      class_id = excluded.class_id,
      teacher_name = excluded.teacher_name,
      status = excluded.status,
      notes = excluded.notes,
      recorded_by = excluded.recorded_by,
      updated_at = excluded.updated_at
  `);

  const tx = db.transaction(() => {
    for (const item of entries) {
      if (!item.student_id || !['H', 'S', 'I', 'A', 'HD'].includes(item.status)) continue;
      const student = db.prepare('SELECT class_id FROM students WHERE id = ?').get(Number(item.student_id)) as
        | { class_id: number }
        | undefined;
      if (!student) continue;
      upsert.run(
        Number(item.student_id),
        Number(item.class_id || student.class_id),
        normalizedClassLabel,
        normalizedSubject,
        normalizedTeacher,
        String(date),
        normalizedSession,
        item.status,
        String(item.notes || '').trim(),
        req.user!.id,
        now
      );
    }
  });

  tx();
  res.json({
    ok: true,
    count: entries.length,
    session_type: normalizedSession,
    class_label: normalizedClassLabel,
    subject: normalizedSubject,
    teacher_name: normalizedTeacher,
  });
});

app.post('/api/attendance/toggle', requireAuth, (req: AuthedRequest, res: Response) => {
  const { student_id, date, session_type, class_label, subject, teacher_name, status, notes } = req.body || {};
  if (!student_id || !date) {
    res.status(400).json({ error: 'student_id dan date wajib diisi.' });
    return;
  }

  const normalizedSession = normalizeSession(session_type);
  const normalizedClassLabel = normalizeClassLabel(class_label);
  const normalizedSubject = normalizeSubject(subject);
  const normalizedTeacher = normalizeTeacherName(teacher_name);

  if (status === null || status === '') {
    db.prepare(
      'DELETE FROM attendance WHERE student_id = ? AND date = ? AND session_type = ? AND subject = ? AND class_label = ?'
    ).run(Number(student_id), String(date), normalizedSession, normalizedSubject, normalizedClassLabel);
    res.json({ ok: true, record: null });
    return;
  }

  if (!['H', 'S', 'I', 'A', 'HD'].includes(status)) {
    res.status(400).json({ error: 'Status absensi harus H, S, I, HD, atau A.' });
    return;
  }

  const student = db.prepare('SELECT class_id FROM students WHERE id = ?').get(Number(student_id)) as
    | { class_id: number }
    | undefined;
  if (!student) {
    res.status(404).json({ error: 'Santri tidak ditemukan.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO attendance (
      student_id, class_id, class_label, subject, teacher_name,
      date, session_type, status, notes, recorded_by, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_id, date, session_type, subject, class_label) DO UPDATE SET
      teacher_name = excluded.teacher_name,
      status = excluded.status,
      notes = CASE WHEN excluded.notes = '' THEN attendance.notes ELSE excluded.notes END,
      recorded_by = excluded.recorded_by,
      updated_at = excluded.updated_at
  `).run(
    Number(student_id),
    student.class_id,
    normalizedClassLabel,
    normalizedSubject,
    normalizedTeacher,
    String(date),
    normalizedSession,
    status,
    String(notes || '').trim(),
    req.user!.id,
    now
  );

  const record = db
    .prepare(
      'SELECT a.*, u.full_name as recorded_by_name FROM attendance a LEFT JOIN users u ON u.id = a.recorded_by WHERE a.student_id = ? AND a.date = ? AND a.session_type = ? AND a.subject = ? AND a.class_label = ?'
    )
    .get(Number(student_id), String(date), normalizedSession, normalizedSubject, normalizedClassLabel);

  res.json({ ok: true, record });
});

app.post('/api/attendance/reset', requireAuth, (req: AuthedRequest, res: Response) => {
  const { scope, date, month, session_type, class_label, subject } = req.body || {};
  const validScopes = ['daily_session', 'daily_all', 'monthly_session', 'all'];
  if (!validScopes.includes(scope)) {
    res.status(400).json({ error: 'Jenis reset absensi tidak valid.' });
    return;
  }

  let deleted = 0;

  if (scope === 'all') {
    const info = db.prepare('DELETE FROM attendance').run();
    deleted = info.changes;
  } else if (scope === 'daily_session') {
    if (!date) {
      res.status(400).json({ error: 'Tanggal wajib diisi untuk reset sesi harian.' });
      return;
    }
    const conds = ['date = ?', 'session_type = ?'];
    const params: unknown[] = [String(date), normalizeSession(session_type)];
    if (class_label && class_label !== 'all') {
      conds.push('class_label = ?');
      params.push(String(class_label));
    }
    if (subject && subject !== 'all') {
      conds.push('subject = ?');
      params.push(normalizeSubject(subject));
    }
    const info = db.prepare(`DELETE FROM attendance WHERE ${conds.join(' AND ')}`).run(...params);
    deleted = info.changes;
  } else if (scope === 'daily_all') {
    if (!date) {
      res.status(400).json({ error: 'Tanggal wajib diisi untuk reset absensi harian.' });
      return;
    }
    const conds = ['date = ?'];
    const params: unknown[] = [String(date)];
    if (class_label && class_label !== 'all') {
      conds.push('class_label = ?');
      params.push(String(class_label));
    }
    if (subject && subject !== 'all') {
      conds.push('subject = ?');
      params.push(normalizeSubject(subject));
    }
    const info = db.prepare(`DELETE FROM attendance WHERE ${conds.join(' AND ')}`).run(...params);
    deleted = info.changes;
  } else if (scope === 'monthly_session') {
    if (!month) {
      res.status(400).json({ error: 'Bulan wajib diisi untuk reset matriks bulanan.' });
      return;
    }
    const conds = ['date LIKE ?', 'session_type = ?'];
    const params: unknown[] = [`${String(month)}%`, normalizeSession(session_type)];
    if (class_label && class_label !== 'all') {
      conds.push('class_label = ?');
      params.push(String(class_label));
    }
    if (subject && subject !== 'all') {
      conds.push('subject = ?');
      params.push(normalizeSubject(subject));
    }
    const info = db.prepare(`DELETE FROM attendance WHERE ${conds.join(' AND ')}`).run(...params);
    deleted = info.changes;
  }

  res.json({ ok: true, deleted });
});

app.get('/api/attendance/recap', requireAuth, (req: AuthedRequest, res: Response) => {
  const { mode, date, month, classLabel, subject, teacherName, sessionType } = req.query;
  const targetMode = mode === 'monthly' ? 'monthly' : 'daily';

  const students = db
    .prepare(`
      SELECT s.id as student_id, s.nis, s.full_name, s.gender, COALESCE(c.name, 'Kelas Diniyah') as class_name, s.status
      FROM students s
      LEFT JOIN classes c ON c.id = s.class_id
      WHERE s.status = 'Aktif'
      ORDER BY s.full_name ASC
    `)
    .all() as Array<{
    student_id: number;
    nis: string;
    full_name: string;
    gender: 'L' | 'P';
    class_name: string;
    status: string;
  }>;

  const conds: string[] = [];
  const params: unknown[] = [];

  if (targetMode === 'daily') {
    conds.push('a.date = ?');
    params.push(String(date || getTodayStr()));
  } else if (month && month !== 'all') {
    conds.push('a.date LIKE ?');
    params.push(`${String(month)}%`);
  }

  if (classLabel && classLabel !== 'all') {
    conds.push('a.class_label = ?');
    params.push(String(classLabel));
  }
  if (subject && subject !== 'all') {
    conds.push('a.subject = ?');
    params.push(normalizeSubject(subject));
  }
  if (teacherName && teacherName !== 'all') {
    conds.push('a.teacher_name = ?');
    params.push(String(teacherName));
  }
  if (sessionType && sessionType !== 'all') {
    conds.push('a.session_type = ?');
    params.push(normalizeSession(sessionType));
  }

  const whereClause = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  const records = db
    .prepare(`
      SELECT a.student_id, a.session_type, a.status, a.updated_at
      FROM attendance a
      ${whereClause}
      ORDER BY a.date ASC, a.updated_at ASC
    `)
    .all(...params) as Array<{
    student_id: number;
    session_type: string;
    status: 'H' | 'S' | 'I' | 'A' | 'HD';
    updated_at: string;
  }>;

  const byStudent = new Map<
    number,
    {
      hadir: number;
      sakit: number;
      izin: number;
      haid: number;
      alpha: number;
      sessions: Record<string, 'H' | 'S' | 'I' | 'A' | 'HD' | ''>;
    }
  >();

  let totalH = 0;
  let totalS = 0;
  let totalI = 0;
  let totalHd = 0;
  let totalA = 0;

  for (const r of records) {
    let entry = byStudent.get(r.student_id);
    if (!entry) {
      entry = {
        hadir: 0,
        sakit: 0,
        izin: 0,
        haid: 0,
        alpha: 0,
        sessions: { Subuh: '', Zuhur: '', Asar: '', Magrib: '', Isya: '' },
      };
      byStudent.set(r.student_id, entry);
    }

    if (r.status === 'H') {
      entry.hadir++;
      totalH++;
    } else if (r.status === 'S') {
      entry.sakit++;
      totalS++;
    } else if (r.status === 'I') {
      entry.izin++;
      totalI++;
    } else if (r.status === 'HD') {
      entry.haid++;
      totalHd++;
    } else if (r.status === 'A') {
      entry.alpha++;
      totalA++;
    }

    if (VALID_SESSIONS.includes(r.session_type)) {
      entry.sessions[r.session_type] = r.status;
    }
  }

  const rows = students.map((st) => {
    const agg = byStudent.get(st.student_id) || {
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
      ...st,
      hadir: agg.hadir,
      sakit: agg.sakit,
      izin: agg.izin,
      haid: agg.haid,
      alpha: agg.alpha,
      total_sessions,
      attendance_rate,
      sessions: agg.sessions,
    };
  });

  const total_records = totalH + totalS + totalI + totalHd + totalA;
  const overall_rate = total_records > 0 ? Math.round((totalH / total_records) * 1000) / 10 : 0;

  res.json({
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
  });
});

// --- RECAP PER SANTRI ---
app.get('/api/recap', requireAuth, (req: AuthedRequest, res: Response) => {
  const { date, month, classId, classLabel, subject, teacherName, sessionType } = req.query;
  const dateFilter = date && date !== 'all' ? String(date) : '';
  const monthFilter = !dateFilter && month && month !== 'all' ? String(month) : '';
  const sessionFilter = sessionType && sessionType !== 'all' ? normalizeSession(sessionType) : '';
  const classLabelFilter = classLabel && classLabel !== 'all' ? String(classLabel) : '';
  const subjectFilter = subject && subject !== 'all' ? normalizeSubject(subject) : '';
  const teacherFilter = teacherName && teacherName !== 'all' ? String(teacherName) : '';

  const studentConds: string[] = [];
  const studentParams: unknown[] = [];

  if (classId && classId !== 'all') {
    studentConds.push('s.class_id = ?');
    studentParams.push(Number(classId));
  }

  const whereStudents = studentConds.length > 0 ? `WHERE ${studentConds.join(' AND ')}` : '';
  const students = db
    .prepare(`
      SELECT s.id as student_id, s.nis, s.full_name, s.gender, s.class_id, c.name as class_name, s.status, s.target_juz
      FROM students s
      LEFT JOIN classes c ON c.id = s.class_id
      ${whereStudents}
      ORDER BY c.name ASC, s.full_name ASC
    `)
    .all(...studentParams) as Array<{
    student_id: number;
    nis: string;
    full_name: string;
    gender: 'L' | 'P';
    class_id: number;
    class_name: string;
    status: string;
    target_juz: number;
  }>;

  const attConds = ['student_id = ?'];
  if (dateFilter) attConds.push('date = ?');
  else if (monthFilter) attConds.push('date LIKE ?');
  if (sessionFilter) attConds.push('session_type = ?');
  if (classLabelFilter) attConds.push('class_label = ?');
  if (subjectFilter) attConds.push('subject = ?');
  if (teacherFilter) attConds.push('teacher_name = ?');

  const attStmt = db.prepare(`SELECT status, COUNT(*) as cnt FROM attendance WHERE ${attConds.join(' AND ')} GROUP BY status`);

  const logStmt = dateFilter
    ? db.prepare('SELECT type, COUNT(*) as cnt, COALESCE(SUM(total_ayat), 0) as ayat FROM memorization_logs WHERE student_id = ? AND date = ? GROUP BY type')
    : monthFilter
      ? db.prepare('SELECT type, COUNT(*) as cnt, COALESCE(SUM(total_ayat), 0) as ayat FROM memorization_logs WHERE student_id = ? AND date LIKE ? GROUP BY type')
      : db.prepare('SELECT type, COUNT(*) as cnt, COALESCE(SUM(total_ayat), 0) as ayat FROM memorization_logs WHERE student_id = ? GROUP BY type');

  const lastLogStmt = db.prepare(`
    SELECT surah_name, ayat_start, ayat_end
    FROM memorization_logs
    WHERE student_id = ? AND type = 'hafalan'
    ORDER BY date DESC, id DESC
    LIMIT 1
  `);

  const recap = students.map((st) => {
    const attParams: unknown[] = [st.student_id];
    if (dateFilter) attParams.push(dateFilter);
    else if (monthFilter) attParams.push(`${monthFilter}%`);
    if (sessionFilter) attParams.push(sessionFilter);
    if (classLabelFilter) attParams.push(classLabelFilter);
    if (subjectFilter) attParams.push(subjectFilter);
    if (teacherFilter) attParams.push(teacherFilter);

    const attRows = attStmt.all(...attParams) as Array<{
      status: 'H' | 'S' | 'I' | 'A' | 'HD';
      cnt: number;
    }>;

    let hadir = 0;
    let sakit = 0;
    let izin = 0;
    let haid = 0;
    let alpha = 0;
    for (const r of attRows) {
      if (r.status === 'H') hadir = r.cnt;
      else if (r.status === 'S') sakit = r.cnt;
      else if (r.status === 'I') izin = r.cnt;
      else if (r.status === 'HD') haid = r.cnt;
      else if (r.status === 'A') alpha = r.cnt;
    }
    const total_days = hadir + sakit + izin + haid + alpha;
    const attendance_rate = total_days > 0 ? Math.round((hadir / total_days) * 1000) / 10 : 0;

    const logRows = (
      dateFilter
        ? logStmt.all(st.student_id, dateFilter)
        : monthFilter
          ? logStmt.all(st.student_id, `${monthFilter}%`)
          : logStmt.all(st.student_id)
    ) as Array<{
      type: 'hafalan' | 'murojaah';
      cnt: number;
      ayat: number;
    }>;

    let hafalan_count = 0;
    let hafalan_ayat = 0;
    let murojaah_count = 0;
    let murojaah_ayat = 0;
    for (const l of logRows) {
      if (l.type === 'hafalan') {
        hafalan_count = l.cnt;
        hafalan_ayat = l.ayat;
      } else {
        murojaah_count = l.cnt;
        murojaah_ayat = l.ayat;
      }
    }

    const lastLog = lastLogStmt.get(st.student_id) as { surah_name: string; ayat_start: number; ayat_end: number } | undefined;

    return {
      ...st,
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

  res.json({ recap });
});

// --- MEMORIZATION & MUROJAAH ROUTES ---
app.get('/api/memorization', requireAuth, (req: AuthedRequest, res: Response) => {
  const { type, studentId, classId, month, search } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (type && (type === 'hafalan' || type === 'murojaah')) {
    conditions.push('m.type = ?');
    params.push(type);
  }
  if (studentId && studentId !== 'all') {
    conditions.push('m.student_id = ?');
    params.push(Number(studentId));
  }
  if (classId && classId !== 'all') {
    conditions.push('s.class_id = ?');
    params.push(Number(classId));
  }
  if (month && month !== 'all') {
    conditions.push('m.date LIKE ?');
    params.push(`${String(month)}%`);
  }
  if (search && String(search).trim()) {
    conditions.push('(s.full_name LIKE ? OR s.nis LIKE ? OR m.surah_name LIKE ? OR m.notes LIKE ?)');
    const q = `%${String(search).trim()}%`;
    params.push(q, q, q, q);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const logs = db
    .prepare(`
      SELECT m.*, s.full_name as student_name, s.nis as student_nis, s.class_id, c.name as class_name, u.full_name as ustaz_name
      FROM memorization_logs m
      JOIN students s ON s.id = m.student_id
      LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN users u ON u.id = m.ustaz_id
      ${whereClause}
      ORDER BY m.date DESC, m.id DESC
    `)
    .all(...params);

  res.json({ logs });
});

app.post('/api/memorization', requireAuth, (req: AuthedRequest, res: Response) => {
  const {
    student_id,
    type,
    date,
    juz,
    surah_number,
    surah_name,
    ayat_start,
    ayat_end,
    quality,
    murojaah_category,
    notes,
  } = req.body || {};

  if (!student_id || !['hafalan', 'murojaah'].includes(type) || !date || !surah_number || !surah_name) {
    res.status(400).json({ error: 'Santri, jenis setoran, tanggal, dan surah wajib diisi.' });
    return;
  }

  const aStart = Number(ayat_start);
  const aEnd = Number(ayat_end);
  if (!aStart || !aEnd || aEnd < aStart) {
    res.status(400).json({ error: 'Rentang ayat tidak valid (ayat akhir harus >= ayat awal).' });
    return;
  }

  const totalAyat = aEnd - aStart + 1;
  const now = new Date().toISOString();

  const resInsert = db
    .prepare(`
      INSERT INTO memorization_logs (
        student_id, type, date, juz, surah_number, surah_name,
        ayat_start, ayat_end, total_ayat, quality, murojaah_category, notes, ustaz_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      Number(student_id),
      type,
      String(date),
      Number(juz) || 30,
      Number(surah_number),
      String(surah_name).trim(),
      aStart,
      aEnd,
      totalAyat,
      ['Mumtaz', 'Jayyid Jiddan', 'Jayyid', 'Maqbul', 'Mengulang'].includes(quality) ? quality : 'Jayyid Jiddan',
      type === 'murojaah' ? String(murojaah_category || 'Harian').trim() : '',
      String(notes || '').trim(),
      req.user!.id,
      now
    );

  const created = db
    .prepare(`
      SELECT m.*, s.full_name as student_name, s.nis as student_nis, s.class_id, c.name as class_name, u.full_name as ustaz_name
      FROM memorization_logs m
      JOIN students s ON s.id = m.student_id
      LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN users u ON u.id = m.ustaz_id
      WHERE m.id = ?
    `)
    .get(resInsert.lastInsertRowid);

  res.status(201).json({ log: created });
});

app.put('/api/memorization/:id', requireAuth, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM memorization_logs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Catatan tidak ditemukan.' });
    return;
  }

  const b = req.body || {};
  const aStart = b.ayat_start !== undefined ? Number(b.ayat_start) : Number(existing.ayat_start);
  const aEnd = b.ayat_end !== undefined ? Number(b.ayat_end) : Number(existing.ayat_end);
  if (aEnd < aStart) {
    res.status(400).json({ error: 'Ayat akhir tidak boleh lebih kecil dari ayat awal.' });
    return;
  }

  const nextType = ['hafalan', 'murojaah'].includes(b.type) ? b.type : existing.type;

  db.prepare(`
    UPDATE memorization_logs SET
      student_id = ?, type = ?, date = ?, juz = ?, surah_number = ?, surah_name = ?,
      ayat_start = ?, ayat_end = ?, total_ayat = ?, quality = ?, murojaah_category = ?, notes = ?
    WHERE id = ?
  `).run(
    b.student_id !== undefined ? Number(b.student_id) : existing.student_id,
    nextType,
    b.date !== undefined ? String(b.date) : existing.date,
    b.juz !== undefined ? Number(b.juz) : existing.juz,
    b.surah_number !== undefined ? Number(b.surah_number) : existing.surah_number,
    b.surah_name !== undefined ? String(b.surah_name) : existing.surah_name,
    aStart,
    aEnd,
    aEnd - aStart + 1,
    ['Mumtaz', 'Jayyid Jiddan', 'Jayyid', 'Maqbul', 'Mengulang'].includes(b.quality) ? b.quality : existing.quality,
    nextType === 'murojaah' ? String(b.murojaah_category ?? existing.murojaah_category) : '',
    b.notes !== undefined ? String(b.notes).trim() : existing.notes,
    id
  );

  const updated = db
    .prepare(`
      SELECT m.*, s.full_name as student_name, s.nis as student_nis, s.class_id, c.name as class_name, u.full_name as ustaz_name
      FROM memorization_logs m
      JOIN students s ON s.id = m.student_id
      LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN users u ON u.id = m.ustaz_id
      WHERE m.id = ?
    `)
    .get(id);
  res.json({ log: updated });
});

app.delete('/api/memorization/:id', requireAuth, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM memorization_logs WHERE id = ?').run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Catatan tidak ditemukan.' });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/memorization/reset', requireAuth, (_req: AuthedRequest, res: Response) => {
  const info = db.prepare('DELETE FROM memorization_logs').run();
  res.json({ ok: true, deleted: info.changes });
});

// --- KITAB KUNING ROUTES ---
const VALID_KITAB_METHODS = ['Bandongan', 'Sorogan', 'Hafalan Nadhom', 'Praktik Baca Kitab'];
const VALID_GRADES = ['Mumtaz', 'Jayyid Jiddan', 'Jayyid', 'Maqbul', 'Mengulang'];

app.get('/api/kitab-kuning', requireAuth, (req: AuthedRequest, res: Response) => {
  const { studentId, classId, month, fan, search } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (studentId && studentId !== 'all') {
    conditions.push('k.student_id = ?');
    params.push(Number(studentId));
  }
  if (classId && classId !== 'all') {
    conditions.push('s.class_id = ?');
    params.push(Number(classId));
  }
  if (month && month !== 'all') {
    conditions.push('k.date LIKE ?');
    params.push(`${String(month)}%`);
  }
  if (fan && fan !== 'all') {
    conditions.push('k.fan_ilmu = ?');
    params.push(String(fan));
  }
  if (search && String(search).trim()) {
    conditions.push('(s.full_name LIKE ? OR s.nis LIKE ? OR k.kitab_name LIKE ? OR k.chapter_or_bab LIKE ? OR k.notes LIKE ?)');
    const q = `%${String(search).trim()}%`;
    params.push(q, q, q, q, q);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const logs = db
    .prepare(`
      SELECT k.*, s.full_name as student_name, s.nis as student_nis, s.class_id, c.name as class_name, u.full_name as ustaz_name
      FROM kitab_kuning_logs k
      JOIN students s ON s.id = k.student_id
      LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN users u ON u.id = k.ustaz_id
      ${whereClause}
      ORDER BY k.date DESC, k.id DESC
    `)
    .all(...params);

  res.json({ logs });
});

app.post('/api/kitab-kuning', requireAuth, (req: AuthedRequest, res: Response) => {
  const {
    student_id,
    apply_to_all_active,
    date,
    kitab_name,
    fan_ilmu,
    method,
    chapter_or_bab,
    grade,
    notes,
  } = req.body || {};

  if (!date || !kitab_name || !String(kitab_name).trim()) {
    res.status(400).json({ error: 'Tanggal dan nama kitab wajib diisi.' });
    return;
  }

  if (!apply_to_all_active && !student_id) {
    res.status(400).json({ error: 'Pilih santri atau centang catat untuk seluruh santri aktif.' });
    return;
  }

  const normalizedMethod = VALID_KITAB_METHODS.includes(method) ? method : 'Bandongan';
  const normalizedGrade = VALID_GRADES.includes(grade) ? grade : 'Jayyid Jiddan';
  const now = new Date().toISOString();

  const insertStmt = db.prepare(`
    INSERT INTO kitab_kuning_logs (
      student_id, date, kitab_name, fan_ilmu, method, chapter_or_bab, grade, notes, ustaz_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let insertedCount = 0;
  let lastId: number | bigint = 0;

  const tx = db.transaction(() => {
    if (apply_to_all_active) {
      const activeStudents = db.prepare("SELECT id FROM students WHERE status = 'Aktif'").all() as Array<{ id: number }>;
      for (const st of activeStudents) {
        const info = insertStmt.run(
          st.id,
          String(date),
          String(kitab_name).trim(),
          String(fan_ilmu || 'Fiqih').trim(),
          normalizedMethod,
          String(chapter_or_bab || '').trim(),
          normalizedGrade,
          String(notes || '').trim(),
          req.user!.id,
          now
        );
        lastId = info.lastInsertRowid;
        insertedCount++;
      }
    } else {
      const info = insertStmt.run(
        Number(student_id),
        String(date),
        String(kitab_name).trim(),
        String(fan_ilmu || 'Fiqih').trim(),
        normalizedMethod,
        String(chapter_or_bab || '').trim(),
        normalizedGrade,
        String(notes || '').trim(),
        req.user!.id,
        now
      );
      lastId = info.lastInsertRowid;
      insertedCount = 1;
    }
  });

  tx();

  const created = lastId
    ? db
        .prepare(`
          SELECT k.*, s.full_name as student_name, s.nis as student_nis, s.class_id, c.name as class_name, u.full_name as ustaz_name
          FROM kitab_kuning_logs k
          JOIN students s ON s.id = k.student_id
          LEFT JOIN classes c ON c.id = s.class_id
          LEFT JOIN users u ON u.id = k.ustaz_id
          WHERE k.id = ?
        `)
        .get(lastId)
    : null;

  res.status(201).json({ log: created, count: insertedCount });
});

app.put('/api/kitab-kuning/:id', requireAuth, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM kitab_kuning_logs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Catatan Kitab Kuning tidak ditemukan.' });
    return;
  }

  const b = req.body || {};
  db.prepare(`
    UPDATE kitab_kuning_logs SET
      student_id = ?, date = ?, kitab_name = ?, fan_ilmu = ?, method = ?,
      chapter_or_bab = ?, grade = ?, notes = ?
    WHERE id = ?
  `).run(
    b.student_id !== undefined ? Number(b.student_id) : existing.student_id,
    b.date !== undefined ? String(b.date) : existing.date,
    b.kitab_name !== undefined ? String(b.kitab_name).trim() : existing.kitab_name,
    b.fan_ilmu !== undefined ? String(b.fan_ilmu).trim() : existing.fan_ilmu,
    VALID_KITAB_METHODS.includes(b.method) ? b.method : existing.method,
    b.chapter_or_bab !== undefined ? String(b.chapter_or_bab).trim() : existing.chapter_or_bab,
    VALID_GRADES.includes(b.grade) ? b.grade : existing.grade,
    b.notes !== undefined ? String(b.notes).trim() : existing.notes,
    id
  );

  const updated = db
    .prepare(`
      SELECT k.*, s.full_name as student_name, s.nis as student_nis, s.class_id, c.name as class_name, u.full_name as ustaz_name
      FROM kitab_kuning_logs k
      JOIN students s ON s.id = k.student_id
      LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN users u ON u.id = k.ustaz_id
      WHERE k.id = ?
    `)
    .get(id);
  res.json({ log: updated });
});

app.delete('/api/kitab-kuning/:id', requireAuth, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM kitab_kuning_logs WHERE id = ?').run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Catatan Kitab Kuning tidak ditemukan.' });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/kitab-kuning/reset', requireAuth, (_req: AuthedRequest, res: Response) => {
  const info = db.prepare('DELETE FROM kitab_kuning_logs').run();
  res.json({ ok: true, deleted: info.changes });
});

app.post('/api/data/reset-logs', requireAuth, (req: AuthedRequest, res: Response) => {
  const includeKitab = Boolean(req.body?.include_kitab);
  let attCount = 0;
  let memCount = 0;
  let kitabCount = 0;
  const tx = db.transaction(() => {
    attCount = db.prepare('DELETE FROM attendance').run().changes;
    memCount = db.prepare('DELETE FROM memorization_logs').run().changes;
    if (includeKitab) {
      kitabCount = db.prepare('DELETE FROM kitab_kuning_logs').run().changes;
    }
  });
  tx();
  res.json({ ok: true, deleted: { attendance: attCount, memorization_logs: memCount, kitab_kuning_logs: kitabCount } });
});

// --- DASHBOARD SUMMARY ---
app.get('/api/dashboard', requireAuth, (_req: AuthedRequest, res: Response) => {
  const today = getTodayStr();
  const currentMonth = today.slice(0, 7);

  const total_students = (db.prepare('SELECT COUNT(*) as c FROM students').get() as { c: number }).c;
  const active_students = (db.prepare("SELECT COUNT(*) as c FROM students WHERE status = 'Aktif'").get() as { c: number }).c;
  const total_classes = (db.prepare('SELECT COUNT(*) as c FROM classes').get() as { c: number }).c;

  const todayAttRows = db
    .prepare(`
      SELECT a.status, COUNT(*) as cnt
      FROM attendance a
      JOIN students s ON s.id = a.student_id
      WHERE a.date = ? AND s.status = 'Aktif'
      GROUP BY a.status
    `)
    .all(today) as Array<{ status: 'H' | 'S' | 'I' | 'A' | 'HD'; cnt: number }>;

  let hadir = 0;
  let sakit = 0;
  let izin = 0;
  let haid = 0;
  let alpha = 0;
  for (const r of todayAttRows) {
    if (r.status === 'H') hadir = r.cnt;
    else if (r.status === 'S') sakit = r.cnt;
    else if (r.status === 'I') izin = r.cnt;
    else if (r.status === 'HD') haid = r.cnt;
    else if (r.status === 'A') alpha = r.cnt;
  }
  const recordedDistinct = (
    db
      .prepare(`
        SELECT COUNT(DISTINCT a.student_id) as cnt
        FROM attendance a
        JOIN students s ON s.id = a.student_id
        WHERE a.date = ? AND s.status = 'Aktif'
      `)
      .get(today) as { cnt: number }
  ).cnt;
  const unrecorded = Math.max(0, active_students - recordedDistinct);

  const monthLogs = db
    .prepare(`
      SELECT type, COUNT(*) as cnt, COALESCE(SUM(total_ayat), 0) as ayat
      FROM memorization_logs
      WHERE date LIKE ?
      GROUP BY type
    `)
    .all(`${currentMonth}%`) as Array<{ type: 'hafalan' | 'murojaah'; cnt: number; ayat: number }>;

  let month_hafalan_count = 0;
  let month_hafalan_ayat = 0;
  let month_murojaah_count = 0;
  let month_murojaah_ayat = 0;
  for (const m of monthLogs) {
    if (m.type === 'hafalan') {
      month_hafalan_count = m.cnt;
      month_hafalan_ayat = m.ayat;
    } else {
      month_murojaah_count = m.cnt;
      month_murojaah_ayat = m.ayat;
    }
  }

  const class_breakdown = db
    .prepare(`
      SELECT
        c.id,
        c.name,
        c.level,
        u.full_name as ustaz_name,
        (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 'Aktif') as student_count,
        (SELECT COUNT(DISTINCT a.student_id) FROM attendance a JOIN students s ON s.id = a.student_id WHERE s.class_id = c.id AND a.date = ? AND a.status = 'H') as today_hadir,
        (SELECT COUNT(*) FROM memorization_logs ml JOIN students s ON s.id = ml.student_id WHERE s.class_id = c.id AND ml.date LIKE ? AND ml.type = 'hafalan') as month_hafalan
      FROM classes c
      LEFT JOIN users u ON u.id = c.ustaz_id
      ORDER BY c.name ASC
    `)
    .all(today, `${currentMonth}%`);

  const recent_logs = db
    .prepare(`
      SELECT m.*, s.full_name as student_name, s.nis as student_nis, s.class_id, c.name as class_name, u.full_name as ustaz_name
      FROM memorization_logs m
      JOIN students s ON s.id = m.student_id
      LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN users u ON u.id = m.ustaz_id
      ORDER BY m.date DESC, m.id DESC
      LIMIT 8
    `)
    .all();

  // --- Memorization Trends (8 Weeks & 6 Months) ---
  const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const fmtDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [ty, tm, td] = today.split('-').map(Number);
  const todayDate = new Date(ty, tm - 1, td);
  const dayOffsetFromMon = (todayDate.getDay() + 6) % 7;
  const currentMonday = new Date(ty, tm - 1, td - dayOffsetFromMon);

  const weeklyBuckets: Array<{
    period: string;
    label: string;
    start: string;
    end: string;
    hafalan_count: number;
    hafalan_ayat: number;
    murojaah_count: number;
    murojaah_ayat: number;
  }> = [];

  for (let i = 7; i >= 0; i--) {
    const ws = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() - i * 7);
    const we = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6);
    const startStr = fmtDate(ws);
    const endStr = fmtDate(we);
    const label =
      ws.getMonth() === we.getMonth()
        ? `${ws.getDate()}–${we.getDate()} ${MONTHS_ID[we.getMonth()]}`
        : `${ws.getDate()} ${MONTHS_ID[ws.getMonth()]}–${we.getDate()} ${MONTHS_ID[we.getMonth()]}`;
    weeklyBuckets.push({
      period: startStr,
      label,
      start: startStr,
      end: endStr,
      hafalan_count: 0,
      hafalan_ayat: 0,
      murojaah_count: 0,
      murojaah_ayat: 0,
    });
  }

  const monthlyBuckets: Array<{
    period: string;
    label: string;
    hafalan_count: number;
    hafalan_ayat: number;
    murojaah_count: number;
    murojaah_ayat: number;
  }> = [];

  for (let i = 5; i >= 0; i--) {
    const md = new Date(ty, tm - 1 - i, 1);
    const ym = `${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, '0')}`;
    const label = `${MONTHS_ID[md.getMonth()]} ${String(md.getFullYear()).slice(-2)}`;
    monthlyBuckets.push({
      period: ym,
      label,
      hafalan_count: 0,
      hafalan_ayat: 0,
      murojaah_count: 0,
      murojaah_ayat: 0,
    });
  }

  const earliestWeekStart = weeklyBuckets[0].start;
  const earliestMonthStart = `${monthlyBuckets[0].period}-01`;
  const earliestTrendDate = earliestWeekStart < earliestMonthStart ? earliestWeekStart : earliestMonthStart;

  const trendLogs = db
    .prepare(`
      SELECT date, type, COALESCE(total_ayat, 0) as total_ayat
      FROM memorization_logs
      WHERE date >= ?
    `)
    .all(earliestTrendDate) as Array<{ date: string; type: 'hafalan' | 'murojaah'; total_ayat: number }>;

  const monthMap = new Map(monthlyBuckets.map((b) => [b.period, b]));

  for (const log of trendLogs) {
    const ayat = Number(log.total_ayat || 0);
    const monthKey = log.date.slice(0, 7);
    const mb = monthMap.get(monthKey);
    if (mb) {
      if (log.type === 'hafalan') {
        mb.hafalan_count += 1;
        mb.hafalan_ayat += ayat;
      } else {
        mb.murojaah_count += 1;
        mb.murojaah_ayat += ayat;
      }
    }
    for (const wb of weeklyBuckets) {
      if (log.date >= wb.start && log.date <= wb.end) {
        if (log.type === 'hafalan') {
          wb.hafalan_count += 1;
          wb.hafalan_ayat += ayat;
        } else {
          wb.murojaah_count += 1;
          wb.murojaah_ayat += ayat;
        }
        break;
      }
    }
  }

  const memorization_trends = {
    weekly: weeklyBuckets.map(({ start: _s, end: _e, ...rest }) => rest),
    monthly: monthlyBuckets,
  };

  // --- Target Juz Alerts (Approaching & Achieved/Exceeded) ---
  const studentTargetRows = db
    .prepare(`
      SELECT
        s.id as student_id,
        s.nis,
        s.full_name,
        COALESCE(c.name, '-') as class_name,
        COALESCE(s.initial_juz, 0) as initial_juz,
        COALESCE(s.target_juz, 0) as target_juz,
        COALESCE(SUM(CASE WHEN m.type = 'hafalan' THEN m.total_ayat ELSE 0 END), 0) as hafalan_ayat,
        (
          SELECT m2.surah_name
          FROM memorization_logs m2
          WHERE m2.student_id = s.id
          ORDER BY m2.date DESC, m2.id DESC
          LIMIT 1
        ) as last_surah,
        (
          SELECT m2.date
          FROM memorization_logs m2
          WHERE m2.student_id = s.id
          ORDER BY m2.date DESC, m2.id DESC
          LIMIT 1
        ) as last_date
      FROM students s
      LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN memorization_logs m ON m.student_id = s.id
      WHERE s.status = 'Aktif'
      GROUP BY s.id
    `)
    .all() as Array<{
    student_id: number;
    nis: string;
    full_name: string;
    class_name: string;
    initial_juz: number;
    target_juz: number;
    hafalan_ayat: number;
    last_surah: string | null;
    last_date: string | null;
  }>;

  const target_alerts: Array<{
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
  }> = [];

  for (const row of studentTargetRows) {
    const targetJuz = Number(row.target_juz || 0);
    if (targetJuz <= 0) continue;
    const initialJuz = Number(row.initial_juz || 0);
    const hafalanAyat = Number(row.hafalan_ayat || 0);
    const currentJuz = Math.min(30, Math.round((initialJuz + hafalanAyat / 208) * 10) / 10);
    const remainingJuz = Math.max(0, Math.round((targetJuz - currentJuz) * 10) / 10);
    const progressPct = Math.round((currentJuz / targetJuz) * 1000) / 10;

    if (currentJuz >= targetJuz) {
      target_alerts.push({
        student_id: row.student_id,
        nis: row.nis,
        full_name: row.full_name,
        class_name: row.class_name,
        initial_juz: initialJuz,
        target_juz: targetJuz,
        hafalan_ayat: hafalanAyat,
        current_juz: currentJuz,
        remaining_juz: 0,
        progress_pct: progressPct,
        status: 'tercapai',
        last_surah: row.last_surah,
        last_date: row.last_date,
      });
    } else if (currentJuz > 0 && (progressPct >= 80 || remainingJuz <= 1.5)) {
      target_alerts.push({
        student_id: row.student_id,
        nis: row.nis,
        full_name: row.full_name,
        class_name: row.class_name,
        initial_juz: initialJuz,
        target_juz: targetJuz,
        hafalan_ayat: hafalanAyat,
        current_juz: currentJuz,
        remaining_juz: remainingJuz,
        progress_pct: progressPct,
        status: 'mendekati',
        last_surah: row.last_surah,
        last_date: row.last_date,
      });
    }
  }

  target_alerts.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'tercapai' ? -1 : 1;
    if (b.progress_pct !== a.progress_pct) return b.progress_pct - a.progress_pct;
    return a.full_name.localeCompare(b.full_name);
  });

  res.json({
    total_students,
    active_students,
    total_classes,
    today,
    today_attendance: { hadir, sakit, izin, haid, alpha, unrecorded },
    month_hafalan_count,
    month_hafalan_ayat,
    month_murojaah_count,
    month_murojaah_ayat,
    class_breakdown,
    recent_logs,
    memorization_trends,
    target_alerts,
  });
});

// --- BACKUP & RESTORE ROUTES ---
app.get('/api/backup/export', requireAuth, (req: AuthedRequest, res: Response) => {
  const payload = buildFullBackup(req.user!.username);
  const datePart = getTodayStr();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="tahfidztrack-backup-${datePart}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

app.post('/api/backup/restore', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  try {
    const payload = req.body as FullBackupPayload;
    const counts = restoreFromBackup(payload);
    res.json({ ok: true, restored: counts });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memulihkan backup.' });
  }
});

app.get('/api/backup/snapshots', requireAuth, (_req: AuthedRequest, res: Response) => {
  const snapshots = listServerSnapshots();
  res.json({ snapshots });
});

app.post('/api/backup/snapshots', requireAuth, (req: AuthedRequest, res: Response) => {
  const label = String(req.body?.label || 'manual');
  const snapshot = createServerSnapshot(label, req.user!.id);
  res.status(201).json({ snapshot });
});

app.get('/api/backup/snapshots/:filename/download', requireAuth, (req: AuthedRequest, res: Response) => {
  const filePath = getSnapshotPath(String(req.params.filename));
  if (!filePath) {
    res.status(404).json({ error: 'Snapshot tidak ditemukan.' });
    return;
  }
  res.download(filePath);
});

app.post('/api/backup/snapshots/:filename/restore', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  const filePath = getSnapshotPath(String(req.params.filename));
  if (!filePath) {
    res.status(404).json({ error: 'Snapshot tidak ditemukan.' });
    return;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const payload = JSON.parse(raw) as FullBackupPayload;
    const counts = restoreFromBackup(payload);
    res.json({ ok: true, restored: counts });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memulihkan snapshot.' });
  }
});

app.delete('/api/backup/snapshots/:filename', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
  const filePath = getSnapshotPath(String(req.params.filename));
  if (!filePath) {
    res.status(404).json({ error: 'Snapshot tidak ditemukan.' });
    return;
  }
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// --- VITE DEV / PROD STATIC SERVING ---
const isDevMode = process.argv.includes('--dev') || (!fs.existsSync(path.join(__dirname, 'dist')) && process.env.NODE_ENV !== 'production');

async function startServer() {
  if (isDevMode) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TahfidzTrack server running on http://0.0.0.0:${PORT} (${isDevMode ? 'dev' : 'prod'})`);
  });
}

startServer();
