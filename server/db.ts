import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_PATH = path.join(DATA_DIR, 'pesantren.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const originalBuf = Buffer.from(originalHash, 'hex');
  if (derived.length !== originalBuf.length) return false;
  return crypto.timingSafeEqual(derived, originalBuf);
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'ustaz')),
      nip_or_kode TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'Mutawassith',
      ustaz_id INTEGER,
      schedule TEXT NOT NULL DEFAULT 'Ba''da Subuh & Ba''da Ashar',
      target_juz INTEGER NOT NULL DEFAULT 5,
      room TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (ustaz_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nis TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('L', 'P')),
      birth_place TEXT NOT NULL DEFAULT '',
      birth_date TEXT NOT NULL DEFAULT '',
      class_id INTEGER NOT NULL,
      guardian_name TEXT NOT NULL DEFAULT '',
      guardian_phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      entry_date TEXT NOT NULL,
      target_juz INTEGER NOT NULL DEFAULT 30,
      initial_juz REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Cuti', 'Lulus', 'Berhenti')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      class_label TEXT NOT NULL DEFAULT 'Kelas Diniyah',
      subject TEXT NOT NULL DEFAULT 'Tahfidz Al Qur''an',
      teacher_name TEXT NOT NULL DEFAULT 'Ustadz M Nabil Rosyadi Lc',
      date TEXT NOT NULL,
      session_type TEXT NOT NULL DEFAULT 'Subuh',
      status TEXT NOT NULL CHECK (status IN ('H', 'S', 'I', 'A', 'HD')),
      notes TEXT NOT NULL DEFAULT '',
      recorded_by INTEGER,
      updated_at TEXT NOT NULL,
      UNIQUE(student_id, date, session_type, subject, class_label),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS memorization_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('hafalan', 'murojaah')),
      date TEXT NOT NULL,
      juz INTEGER NOT NULL,
      surah_number INTEGER NOT NULL,
      surah_name TEXT NOT NULL,
      ayat_start INTEGER NOT NULL,
      ayat_end INTEGER NOT NULL,
      total_ayat INTEGER NOT NULL,
      quality TEXT NOT NULL CHECK (quality IN ('Mumtaz', 'Jayyid Jiddan', 'Jayyid', 'Maqbul', 'Mengulang')),
      murojaah_category TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      ustaz_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (ustaz_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS kitab_kuning_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      kitab_name TEXT NOT NULL,
      fan_ilmu TEXT NOT NULL DEFAULT 'Fiqih',
      method TEXT NOT NULL DEFAULT 'Bandongan',
      chapter_or_bab TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL CHECK (grade IN ('Mumtaz', 'Jayyid Jiddan', 'Jayyid', 'Maqbul', 'Mengulang')),
      notes TEXT NOT NULL DEFAULT '',
      ustaz_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (ustaz_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  migrateAttendanceSchema();
  migrateCheckConstraints();
  seedInitialData();
  syncRequestedRosterAndTeacher();
  resetAllLogsFreshOnce();
  resetDefaultPasswordsOnce();
  removeAziziAndWafaOnce();
}

function migrateAttendanceSchema(): void {
  const tableInfo = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'attendance'")
    .get() as { sql: string } | undefined;

  if (
    !tableInfo ||
    (tableInfo.sql.includes('class_label') &&
      tableInfo.sql.includes('subject') &&
      tableInfo.sql.includes('teacher_name') &&
      tableInfo.sql.includes('UNIQUE(student_id, date, session_type, subject, class_label)'))
  ) {
    return;
  }

  const hasNewCols =
    tableInfo.sql.includes('class_label') &&
    tableInfo.sql.includes('subject') &&
    tableInfo.sql.includes('teacher_name');

  const tx = db.transaction(() => {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE attendance_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        class_label TEXT NOT NULL DEFAULT 'Kelas Diniyah',
        subject TEXT NOT NULL DEFAULT 'Tahfidz Al Qur''an',
        teacher_name TEXT NOT NULL DEFAULT 'Ustadz M Nabil Rosyadi Lc',
        date TEXT NOT NULL,
        session_type TEXT NOT NULL DEFAULT 'Subuh',
        status TEXT NOT NULL CHECK (status IN ('H', 'S', 'I', 'A', 'HD')),
        notes TEXT NOT NULL DEFAULT '',
        recorded_by INTEGER,
        updated_at TEXT NOT NULL,
        UNIQUE(student_id, date, session_type, subject, class_label),
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
        FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
      );

      INSERT OR IGNORE INTO attendance_new (
        id, student_id, class_id, class_label, subject, teacher_name,
        date, session_type, status, notes, recorded_by, updated_at
      )
      SELECT
        id,
        student_id,
        class_id,
        ${hasNewCols ? "COALESCE(class_label, 'Kelas Diniyah')" : "'Kelas Diniyah'"},
        ${hasNewCols ? "COALESCE(subject, 'Tahfidz Al Qur''an')" : "'Tahfidz Al Qur''an'"},
        ${hasNewCols ? "COALESCE(teacher_name, 'Ustadz M Nabil Rosyadi Lc')" : "'Ustadz M Nabil Rosyadi Lc'"},
        date,
        CASE
          WHEN session_type IN ('Subuh', 'Zuhur', 'Asar', 'Magrib', 'Isya') THEN session_type
          WHEN session_type = 'Sore' THEN 'Asar'
          ELSE 'Subuh'
        END,
        status,
        notes,
        recorded_by,
        updated_at
      FROM attendance;

      DROP TABLE attendance;
      ALTER TABLE attendance_new RENAME TO attendance;
    `);
    db.pragma('foreign_keys = ON');
  });

  tx();
}

function migrateCheckConstraints(): void {
  const attInfo = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'attendance'")
    .get() as { sql: string } | undefined;
  const stuInfo = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'students'")
    .get() as { sql: string } | undefined;

  const needsAttMigration = attInfo && !attInfo.sql.includes("'HD'");
  const needsStuMigration = stuInfo && !stuInfo.sql.includes("'Berhenti'");

  if (!needsAttMigration && !needsStuMigration) return;

  const tx = db.transaction(() => {
    db.pragma('foreign_keys = OFF');

    if (needsStuMigration) {
      db.exec(`
        CREATE TABLE students_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nis TEXT UNIQUE NOT NULL,
          full_name TEXT NOT NULL,
          gender TEXT NOT NULL CHECK (gender IN ('L', 'P')),
          birth_place TEXT NOT NULL DEFAULT '',
          birth_date TEXT NOT NULL DEFAULT '',
          class_id INTEGER NOT NULL,
          guardian_name TEXT NOT NULL DEFAULT '',
          guardian_phone TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '',
          entry_date TEXT NOT NULL,
          target_juz INTEGER NOT NULL DEFAULT 30,
          initial_juz REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Cuti', 'Lulus', 'Berhenti')),
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT
        );
        INSERT INTO students_new SELECT * FROM students;
        DROP TABLE students;
        ALTER TABLE students_new RENAME TO students;
      `);
    }

    if (needsAttMigration) {
      db.exec(`
        CREATE TABLE attendance_hd (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER NOT NULL,
          class_id INTEGER NOT NULL,
          class_label TEXT NOT NULL DEFAULT 'Kelas Diniyah',
          subject TEXT NOT NULL DEFAULT 'Tahfidz Al Qur''an',
          teacher_name TEXT NOT NULL DEFAULT 'Ustadz M Nabil Rosyadi Lc',
          date TEXT NOT NULL,
          session_type TEXT NOT NULL DEFAULT 'Subuh',
          status TEXT NOT NULL CHECK (status IN ('H', 'S', 'I', 'A', 'HD')),
          notes TEXT NOT NULL DEFAULT '',
          recorded_by INTEGER,
          updated_at TEXT NOT NULL,
          UNIQUE(student_id, date, session_type, subject, class_label),
          FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
          FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
        );
        INSERT INTO attendance_hd (
          id, student_id, class_id, class_label, subject, teacher_name,
          date, session_type, status, notes, recorded_by, updated_at
        )
        SELECT
          id, student_id, class_id,
          'Kelas Diniyah', 'Tahfidz Al Qur''an', 'Ustadz M Nabil Rosyadi Lc',
          date, session_type, status, notes, recorded_by, updated_at
        FROM attendance;
        DROP TABLE attendance;
        ALTER TABLE attendance_hd RENAME TO attendance;
      `);
    }

    db.pragma('foreign_keys = ON');
  });

  tx();
}

function formatDateLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const REQUESTED_STUDENTS_ROSTER: Array<{
  name: string;
  gender: 'L' | 'P';
  status: 'Aktif' | 'Berhenti';
  notes: string;
}> = [
  { name: 'Nur Akila Azklya', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'Risme Gina Fatin', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'Nadila Islami', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'Riski Hasani', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'M Assodiqqi', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'L. rizki dewata saputara', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'Lara Novelia', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'Ahmad khaerul hamdi', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'Giantara', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'M Gozali', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'Torik Rizki', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'Naura Haerun Nisa', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'Haris Yadi Rizki', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'Janeta sadin maharani', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'Salwa mardatillah', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'Lenzi Febriana', gender: 'P', status: 'Aktif', notes: '' },
  { name: "Peti Rapl'a", gender: 'P', status: 'Aktif', notes: '' },
  { name: 'Alinda Sopia Letisa', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'Nadia Riskiyanti Alpani', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'Habibatun Nazwa', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'Wilya Anggraini Natasya', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'Akifa Naila', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'Aninda Yuniarti', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'Dhia Aminatu Zohria', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'Azwan Kahfi', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'L Gilang Kurniaramdani', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'Prasetio Adiguna', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'Aria Saputra', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'Andika Febrian Maulana', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'Riski Fathurrahman', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'M Joe Abi Nopal', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'FAQIH SODIQ', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'AHMAD YAZID IHSAN', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'DHAFIN AZKARRADI', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'M ROZALI HUSEN', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'AHMAD ZIADI AKBAR', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'M FAESAL ZAIINI', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'MARWAH MAULANA', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'AHMAD ZIDNIL HAQIQI', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'SRI HANDAYANI', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'FAUZAN', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'TIFA MELANI', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'ARISTA JUNIANTARI', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'ZAFIRA KHOLIFATUS S', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'APRIL AINI', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'FANISA', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'SITI AUDIA NISA', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'NINDI AYU CAHYANI', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'M ULUL AZMI', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'EVA ELIANA', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'LALU HAERUL AZAM', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'ABDUL HAYI', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'SUCI RAHMATUL IZA', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'KASIH AMALANI', gender: 'P', status: 'Aktif', notes: '' },
  { name: 'AGUS BELING', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'AHMAD SOPIANDI', gender: 'L', status: 'Aktif', notes: '' },
  { name: 'EVRIL', gender: 'P', status: 'Aktif', notes: '' },
];

function seedInitialData(): void {
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount > 0) return;

  const now = new Date().toISOString();

  // Seed Settings
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('institution_name', "Pondok Pesantren Tahfidz Al-Qur'an Al-Falah");
  insertSetting.run('institution_address', 'Jl. Pesantren Raya No. 45, Kec. Sukmajaya, Kota Depok');
  insertSetting.run('head_name', 'Ustadz M Nabil Rosyadi Lc');
  insertSetting.run('academic_year', '2026/2027');

  // Seed Users
  const insertUser = db.prepare(`
    INSERT INTO users (username, full_name, role, nip_or_kode, phone, password_hash, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `);
  insertUser.run('admin', 'Ustadz M Nabil Rosyadi Lc', 'admin', 'ADM-001', '081234567890', hashPassword('admin123'), now);
  insertUser.run('ustaz', 'Ustadz M Nabil Rosyadi Lc', 'ustaz', 'UST-001', '081234567890', hashPassword('ustaz123'), now);
}

function syncRequestedRosterAndTeacher(): void {
  const ver = db.prepare("SELECT value FROM settings WHERE key = 'roster_version'").get() as { value: string } | undefined;
  if (ver?.value === 'nabil_59_v1') return;

  const now = new Date().toISOString();
  const today = new Date();

  const tx = db.transaction(() => {
    // Ensure teacher accounts use Ustadz M Nabil Rosyadi Lc
    db.prepare("UPDATE users SET full_name = 'Ustadz M Nabil Rosyadi Lc' WHERE username IN ('admin', 'ustaz')").run();
    db.prepare("DELETE FROM users WHERE username = 'ustazah'").run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('head_name', 'Ustadz M Nabil Rosyadi Lc')").run();

    let teacher = db.prepare("SELECT id FROM users WHERE username = 'ustaz'").get() as { id: number } | undefined;
    if (!teacher) {
      const res = db
        .prepare(`
          INSERT INTO users (username, full_name, role, nip_or_kode, phone, password_hash, is_active, created_at)
          VALUES ('ustaz', 'Ustadz M Nabil Rosyadi Lc', 'ustaz', 'UST-001', '081234567890', ?, 1, ?)
        `)
        .run(hashPassword('ustaz123'), now);
      teacher = { id: Number(res.lastInsertRowid) };
    }
    const teacherId = teacher.id;

    // Reset classes & students into 1 single class with all 59 requested students
    db.pragma('foreign_keys = OFF');
    db.prepare('DELETE FROM memorization_logs').run();
    db.prepare('DELETE FROM attendance').run();
    db.prepare('DELETE FROM students').run();
    db.prepare('DELETE FROM classes').run();
    db.pragma('foreign_keys = ON');

    const clsRes = db
      .prepare(`
        INSERT INTO classes (name, level, ustaz_id, schedule, target_juz, room, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        "Kelas Tahfidz Al-Qur'an",
        'Tahfidz Reguler',
        teacherId,
        'Subuh, Zuhur, Asar, Magrib, Isya & Kitab Kuning',
        30,
        'Aula Utama Tahfidz',
        now
      );
    const singleClassId = Number(clsRes.lastInsertRowid);

    const insertStudent = db.prepare(`
      INSERT INTO students (
        nis, full_name, gender, birth_place, birth_date, class_id,
        guardian_name, guardian_phone, address, entry_date, target_juz, initial_juz, status, notes, created_at
      ) VALUES (?, ?, ?, '', '', ?, '', '', '', ?, 30, 0, ?, ?, ?)
    `);

    const entryDate = '2026-07-01';

    REQUESTED_STUDENTS_ROSTER.forEach((st, idx) => {
      const nis = `2026${String(idx + 1).padStart(3, '0')}`;
      insertStudent.run(nis, st.name, st.gender, singleClassId, entryDate, st.status, st.notes, now);
    });

    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('roster_version', 'nabil_59_v1')").run();
  });

  tx();
}

function resetAllLogsFreshOnce(): void {
  const flag = db.prepare("SELECT value FROM settings WHERE key = 'clean_reset_v1'").get() as { value: string } | undefined;
  if (flag?.value === '1') return;

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM attendance').run();
    db.prepare('DELETE FROM memorization_logs').run();
    db.prepare("UPDATE classes SET schedule = 'Subuh, Zuhur, Asar, Magrib, Isya & Kitab Kuning'").run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('clean_reset_v1', '1')").run();
  });

  tx();
}

function resetDefaultPasswordsOnce(): void {
  const flag = db
    .prepare("SELECT value FROM settings WHERE key = 'reset_passwords_v1'")
    .get() as { value: string } | undefined;
  if (flag?.value === '1') return;

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const users = db.prepare('SELECT id, username, role FROM users').all() as Array<{
      id: number;
      username: string;
      role: 'admin' | 'ustaz';
    }>;

    const updatePw = db.prepare('UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?');
    let hasAdmin = false;
    let hasUstaz = false;

    for (const u of users) {
      if (u.username === 'admin') {
        hasAdmin = true;
        updatePw.run(hashPassword('admin123'), u.id);
      } else if (u.username === 'ustaz') {
        hasUstaz = true;
        updatePw.run(hashPassword('ustaz123'), u.id);
      } else {
        updatePw.run(hashPassword(u.role === 'admin' ? 'admin123' : 'ustaz123'), u.id);
      }
    }

    const insertUser = db.prepare(`
      INSERT INTO users (username, full_name, role, nip_or_kode, phone, password_hash, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `);
    if (!hasAdmin) {
      insertUser.run('admin', 'Ustadz M Nabil Rosyadi Lc', 'admin', 'ADM-001', '081234567890', hashPassword('admin123'), now);
    }
    if (!hasUstaz) {
      insertUser.run('ustaz', 'Ustadz M Nabil Rosyadi Lc', 'ustaz', 'UST-001', '081234567890', hashPassword('ustaz123'), now);
    }

    db.prepare('DELETE FROM sessions').run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('reset_passwords_v1', '1')").run();
  });

  tx();
}

function removeAziziAndWafaOnce(): void {
  const flag = db
    .prepare("SELECT value FROM settings WHERE key = 'remove_azizi_wafa_v1'")
    .get() as { value: string } | undefined;
  if (flag?.value === '1') return;

  const tx = db.transaction(() => {
    db.prepare(
      "DELETE FROM students WHERE LOWER(TRIM(full_name)) IN ('muhammad azizi', 'wafa hidayat')"
    ).run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('remove_azizi_wafa_v1', '1')").run();
  });

  tx();
}

export interface FullBackupPayload {
  version: string;
  exported_at: string;
  exported_by?: string;
  tables: {
    settings: unknown[];
    users: unknown[];
    classes: unknown[];
    students: unknown[];
    attendance: unknown[];
    memorization_logs: unknown[];
    kitab_kuning_logs?: unknown[];
  };
}

export function buildFullBackup(exportedBy = 'system'): FullBackupPayload {
  return {
    version: '1.0.0',
    exported_at: new Date().toISOString(),
    exported_by: exportedBy,
    tables: {
      settings: db.prepare('SELECT * FROM settings').all(),
      users: db.prepare('SELECT * FROM users').all(),
      classes: db.prepare('SELECT * FROM classes').all(),
      students: db.prepare('SELECT * FROM students').all(),
      attendance: db.prepare('SELECT * FROM attendance').all(),
      memorization_logs: db.prepare('SELECT * FROM memorization_logs').all(),
      kitab_kuning_logs: db.prepare('SELECT * FROM kitab_kuning_logs').all(),
    },
  };
}

export function createServerSnapshot(label = 'manual', userId?: number): { filename: string; size_bytes: number; created_at: string } {
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 30) || 'backup';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${stamp}-${safeLabel}.json`;
  const filePath = path.join(BACKUP_DIR, filename);
  const payload = buildFullBackup(userId ? `user-${userId}` : 'system');
  const content = JSON.stringify(payload, null, 2);
  fs.writeFileSync(filePath, content, 'utf-8');
  const stat = fs.statSync(filePath);
  return {
    filename,
    size_bytes: stat.size,
    created_at: payload.exported_at,
  };
}

export function listServerSnapshots(): Array<{ filename: string; size_bytes: number; created_at: string }> {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json'));
  return files
    .map((filename) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, filename));
      return {
        filename,
        size_bytes: stat.size,
        created_at: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getSnapshotPath(filename: string): string | null {
  const clean = path.basename(filename);
  if (!clean.endsWith('.json')) return null;
  const full = path.join(BACKUP_DIR, clean);
  return fs.existsSync(full) ? full : null;
}

export function restoreFromBackup(payload: FullBackupPayload): {
  classes: number;
  students: number;
  attendance: number;
  memorization_logs: number;
} {
  if (!payload || !payload.tables || !Array.isArray(payload.tables.students) || !Array.isArray(payload.tables.classes)) {
    throw new Error('Format file backup tidak valid.');
  }

  // Create a safety snapshot before restoring
  createServerSnapshot('pre-restore');

  const tx = db.transaction(() => {
    db.pragma('foreign_keys = OFF');

    db.prepare('DELETE FROM kitab_kuning_logs').run();
    db.prepare('DELETE FROM memorization_logs').run();
    db.prepare('DELETE FROM attendance').run();
    db.prepare('DELETE FROM students').run();
    db.prepare('DELETE FROM classes').run();
    db.prepare('DELETE FROM settings').run();

    if (Array.isArray(payload.tables.users) && payload.tables.users.length > 0) {
      db.prepare('DELETE FROM sessions').run();
      db.prepare('DELETE FROM users').run();
      const insUser = db.prepare(`
        INSERT INTO users (id, username, full_name, role, nip_or_kode, phone, password_hash, is_active, created_at)
        VALUES (@id, @username, @full_name, @role, @nip_or_kode, @phone, @password_hash, @is_active, @created_at)
      `);
      for (const u of payload.tables.users as Record<string, unknown>[]) {
        insUser.run(u);
      }
    }

    const insSetting = db.prepare('INSERT INTO settings (key, value) VALUES (@key, @value)');
    for (const s of (payload.tables.settings || []) as Record<string, unknown>[]) {
      insSetting.run(s);
    }

    const insClass = db.prepare(`
      INSERT INTO classes (id, name, level, ustaz_id, schedule, target_juz, room, created_at)
      VALUES (@id, @name, @level, @ustaz_id, @schedule, @target_juz, @room, @created_at)
    `);
    for (const c of payload.tables.classes as Record<string, unknown>[]) {
      insClass.run(c);
    }

    const insStudent = db.prepare(`
      INSERT INTO students (
        id, nis, full_name, gender, birth_place, birth_date, class_id,
        guardian_name, guardian_phone, address, entry_date, target_juz, initial_juz, status, notes, created_at
      ) VALUES (
        @id, @nis, @full_name, @gender, @birth_place, @birth_date, @class_id,
        @guardian_name, @guardian_phone, @address, @entry_date, @target_juz, @initial_juz, @status, @notes, @created_at
      )
    `);
    for (const st of payload.tables.students as Record<string, unknown>[]) {
      insStudent.run(st);
    }

    const insAtt = db.prepare(`
      INSERT INTO attendance (
        id, student_id, class_id, class_label, subject, teacher_name,
        date, session_type, status, notes, recorded_by, updated_at
      )
      VALUES (
        @id, @student_id, @class_id, @class_label, @subject, @teacher_name,
        @date, @session_type, @status, @notes, @recorded_by, @updated_at
      )
    `);
    for (const a of (payload.tables.attendance || []) as Record<string, unknown>[]) {
      insAtt.run({
        class_label: 'Kelas Diniyah',
        subject: "Tahfidz Al Qur'an",
        teacher_name: 'Ustadz M Nabil Rosyadi Lc',
        ...a,
      });
    }

    const insLog = db.prepare(`
      INSERT INTO memorization_logs (
        id, student_id, type, date, juz, surah_number, surah_name,
        ayat_start, ayat_end, total_ayat, quality, murojaah_category, notes, ustaz_id, created_at
      ) VALUES (
        @id, @student_id, @type, @date, @juz, @surah_number, @surah_name,
        @ayat_start, @ayat_end, @total_ayat, @quality, @murojaah_category, @notes, @ustaz_id, @created_at
      )
    `);
    for (const l of (payload.tables.memorization_logs || []) as Record<string, unknown>[]) {
      insLog.run(l);
    }

    const insKitab = db.prepare(`
      INSERT INTO kitab_kuning_logs (
        id, student_id, date, kitab_name, fan_ilmu, method, chapter_or_bab,
        grade, notes, ustaz_id, created_at
      ) VALUES (
        @id, @student_id, @date, @kitab_name, @fan_ilmu, @method, @chapter_or_bab,
        @grade, @notes, @ustaz_id, @created_at
      )
    `);
    for (const k of (payload.tables.kitab_kuning_logs || []) as Record<string, unknown>[]) {
      insKitab.run(k);
    }

    db.pragma('foreign_keys = ON');
  });

  tx();

  return {
    classes: payload.tables.classes.length,
    students: payload.tables.students.length,
    attendance: (payload.tables.attendance || []).length,
    memorization_logs: (payload.tables.memorization_logs || []).length,
  };
}
