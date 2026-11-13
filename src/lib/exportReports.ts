import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type {
  AttendanceRecapRow,
  AttendanceRecord,
  InstitutionSettings,
  KitabKuningLog,
  MemorizationLog,
  Student,
  StudentRecap,
} from '../types';

function formatPeriodLabel(period: string): string {
  if (!period || period === 'all') return 'Semua Periode';
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    const [y, m, d] = period.split('-').map(Number);
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    return `${d} ${months[(m || 1) - 1] || m} ${y}`;
  }
  const [y, m] = period.split('-').map(Number);
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return `${months[(m || 1) - 1] || m} ${y}`;
}

function addPdfHeader(
  doc: jsPDF,
  settings: InstitutionSettings,
  title: string,
  subtitle: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(6, 95, 70);
  doc.text(settings.institution_name || "Pondok Pesantren Tahfidz Al-Qur'an", pageWidth / 2, 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `${settings.institution_address || '-'}  |  Tahun Ajaran ${settings.academic_year || '2026/2027'}`,
    pageWidth / 2,
    19.5,
    { align: 'center' }
  );

  doc.setDrawColor(6, 95, 70);
  doc.setLineWidth(0.5);
  doc.line(14, 23, pageWidth - 14, 23);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 14, 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(subtitle, 14, 35.5);

  return 40;
}

function addPdfFooterSignature(doc: jsPDF, settings: InstitutionSettings): void {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 120;

  let signY = finalY + 12;
  if (signY + 28 > pageHeight) {
    doc.addPage();
    signY = 25;
  }

  const todayText = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(`Dicetak tanggal: ${todayText}`, 14, signY);

  const rightX = pageWidth - 65;
  doc.text('Mengetahui, Pimpinan Lembaga', rightX, signY);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.head_name || 'Pimpinan Tahfidz', rightX, signY + 20);
}

// 1. RECAP SANTRI -> PDF
export function exportRecapPdf(
  recap: StudentRecap[],
  settings: InstitutionSettings,
  month: string,
  classNameLabel: string,
  sessionLabel = 'Semua Waktu',
  extraMeta?: { subjectLabel?: string; teacherLabel?: string }
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const metaParts = [
    `Periode: ${formatPeriodLabel(month)}`,
    `Kelas: ${classNameLabel}`,
    ...(extraMeta?.subjectLabel ? [`Mapel: ${extraMeta.subjectLabel}`] : []),
    ...(extraMeta?.teacherLabel ? [`Pengampu: ${extraMeta.teacherLabel}`] : []),
    `Waktu: ${sessionLabel}`,
    `Total: ${recap.length} Santri`,
  ];
  const startY = addPdfHeader(
    doc,
    settings,
    'LAPORAN REKAP KEHADIRAN & HAFALAN SANTRI',
    metaParts.join('  |  ')
  );

  autoTable(doc, {
    startY,
    head: [[
      'No', 'NIS', 'Nama Santri', 'L/P', 'Kelas',
      'Hadir', 'Sakit', 'Izin', 'Haid', 'Alpha', 'Kehadiran',
      'Setoran Baru', 'Ayat Baru', 'Murojaah', 'Ayat Murojaah', 'Hafalan Terakhir',
    ]],
    body: recap.map((r, i) => [
      i + 1,
      r.nis,
      r.full_name,
      r.gender,
      r.class_name || '-',
      r.hadir,
      r.sakit,
      r.izin,
      r.haid,
      r.alpha,
      `${r.attendance_rate.toFixed(1)}%`,
      `${r.hafalan_count}x`,
      r.hafalan_ayat,
      `${r.murojaah_count}x`,
      r.murojaah_ayat,
      r.last_surah ? `${r.last_surah} (${r.last_ayat})` : '-',
    ]),
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: [6, 95, 70], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { cellWidth: 20 },
      3: { halign: 'center', cellWidth: 10 },
      5: { halign: 'right', cellWidth: 12 },
      6: { halign: 'right', cellWidth: 11 },
      7: { halign: 'right', cellWidth: 11 },
      8: { halign: 'right', cellWidth: 11 },
      9: { halign: 'right', cellWidth: 12 },
      10: { halign: 'right', cellWidth: 18 },
      11: { halign: 'right', cellWidth: 18 },
      12: { halign: 'right', cellWidth: 16 },
      13: { halign: 'right', cellWidth: 16 },
      14: { halign: 'right', cellWidth: 20 },
    },
  });

  addPdfFooterSignature(doc, settings);
  doc.save(`rekap-santri-${month || 'semua'}.pdf`);
}

// 2. RECAP SANTRI -> EXCEL
export function exportRecapExcel(
  recap: StudentRecap[],
  settings: InstitutionSettings,
  month: string,
  classNameLabel: string,
  sessionLabel = 'Semua Waktu',
  extraMeta?: { subjectLabel?: string; teacherLabel?: string }
): void {
  const rows = recap.map((r, i) => ({
    No: i + 1,
    NIS: r.nis,
    'Nama Santri': r.full_name,
    'L/P': r.gender,
    Kelas: r.class_name || '-',
    Status: r.status,
    Hadir: r.hadir,
    Sakit: r.sakit,
    Izin: r.izin,
    Haid: r.haid,
    Alpha: r.alpha,
    'Total Sesi Tercatat': r.total_days,
    'Persentase Kehadiran (%)': r.attendance_rate,
    'Jumlah Setoran Hafalan': r.hafalan_count,
    'Total Ayat Hafalan': r.hafalan_ayat,
    'Jumlah Murojaah': r.murojaah_count,
    'Total Ayat Murojaah': r.murojaah_ayat,
    'Hafalan Terakhir': r.last_surah ? `${r.last_surah} (${r.last_ayat})` : '-',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Santri');

  const metaRows = [
    ['Lembaga', settings.institution_name],
    ['Alamat', settings.institution_address],
    ['Periode', formatPeriodLabel(month)],
    ['Filter Kelas', classNameLabel],
    ['Mata Pelajaran', extraMeta?.subjectLabel || 'Semua Mata Pelajaran'],
    ['Guru Pengampu', extraMeta?.teacherLabel || 'Semua Guru Pengampu'],
    ['Waktu Pelajaran', sessionLabel],
    ['Tahun Ajaran', settings.academic_year],
  ];
  const metaSheet = XLSX.utils.aoa_to_sheet(metaRows);
  XLSX.utils.book_append_sheet(wb, metaSheet, 'Info Laporan');

  XLSX.writeFile(wb, `rekap-santri-${month || 'semua'}.xlsx`);
}

// 2B. ATTENDANCE RECAP (DAILY & MONTHLY) -> PDF
export function exportAttendanceRecapPdf(
  rows: AttendanceRecapRow[],
  settings: InstitutionSettings,
  options: {
    mode: 'daily' | 'monthly';
    period: string;
    classLabel?: string;
    subjectLabel: string;
    teacherLabel: string;
    sessionLabel: string;
  }
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const title =
    options.mode === 'daily'
      ? 'REKAP ABSENSI HARIAN SANTRI'
      : 'REKAP ABSENSI BULANAN SANTRI';
  const subtitleParts = [
    `${options.mode === 'daily' ? 'Tanggal' : 'Bulan'}: ${formatPeriodLabel(options.period)}`,
    ...(options.classLabel ? [`Kelas: ${options.classLabel}`] : []),
    `Mapel: ${options.subjectLabel}`,
    `Guru: ${options.teacherLabel}`,
    `Waktu: ${options.sessionLabel}`,
  ];
  const startY = addPdfHeader(doc, settings, title, subtitleParts.join('  |  '));

  if (options.mode === 'daily') {
    autoTable(doc, {
      startY,
      head: [[
        'No', 'NIS', 'Nama Santri', 'L/P',
        'Subuh', 'Zuhur', 'Asar', 'Magrib', 'Isya',
        'H', 'S', 'I', 'HD', 'A', 'Total', '%',
      ]],
      body: rows.map((r, idx) => [
        idx + 1,
        r.nis,
        r.full_name,
        r.gender,
        r.sessions.Subuh || '-',
        r.sessions.Zuhur || '-',
        r.sessions.Asar || '-',
        r.sessions.Magrib || '-',
        r.sessions.Isya || '-',
        r.hadir,
        r.sakit,
        r.izin,
        r.haid,
        r.alpha,
        r.total_sessions,
        `${r.attendance_rate.toFixed(1)}%`,
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.8, halign: 'center' },
      headStyles: { fillColor: [6, 95, 70], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 9 },
        1: { cellWidth: 20, halign: 'left' },
        2: { halign: 'left', cellWidth: 52 },
        3: { cellWidth: 10 },
      },
    });
  } else {
    const monthlyHead = options.classLabel
      ? ['No', 'NIS', 'Nama Santri', 'L/P', 'Kelas', 'Hadir (H)', 'Sakit (S)', 'Izin (I)', 'Haid (HD)', 'Alpha (A)', 'Total Sesi', 'Persentase']
      : ['No', 'NIS', 'Nama Santri', 'L/P', 'Hadir (H)', 'Sakit (S)', 'Izin (I)', 'Haid (HD)', 'Alpha (A)', 'Total Sesi', 'Persentase'];

    const monthlyBody = rows.map((r, idx) =>
      options.classLabel
        ? [idx + 1, r.nis, r.full_name, r.gender, r.class_name, r.hadir, r.sakit, r.izin, r.haid, r.alpha, r.total_sessions, `${r.attendance_rate.toFixed(1)}%`]
        : [idx + 1, r.nis, r.full_name, r.gender, r.hadir, r.sakit, r.izin, r.haid, r.alpha, r.total_sessions, `${r.attendance_rate.toFixed(1)}%`]
    );

    const numStartCol = options.classLabel ? 5 : 4;
    autoTable(doc, {
      startY,
      head: [monthlyHead],
      body: monthlyBody,
      styles: { fontSize: 8, cellPadding: 2.2 },
      headStyles: { fillColor: [6, 95, 70], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 22 },
        3: { halign: 'center', cellWidth: 11 },
        [numStartCol]: { halign: 'right' },
        [numStartCol + 1]: { halign: 'right' },
        [numStartCol + 2]: { halign: 'right' },
        [numStartCol + 3]: { halign: 'right' },
        [numStartCol + 4]: { halign: 'right' },
        [numStartCol + 5]: { halign: 'right' },
        [numStartCol + 6]: { halign: 'right' },
      },
    });
  }

  addPdfFooterSignature(doc, settings);
  doc.save(`rekap-absensi-${options.mode === 'daily' ? 'harian' : 'bulanan'}-${options.period}.pdf`);
}

// 2C. ATTENDANCE RECAP (DAILY & MONTHLY) -> EXCEL
export function exportAttendanceRecapExcel(
  rows: AttendanceRecapRow[],
  settings: InstitutionSettings,
  options: {
    mode: 'daily' | 'monthly';
    period: string;
    classLabel?: string;
    subjectLabel: string;
    teacherLabel: string;
    sessionLabel: string;
  }
): void {
  const sheetRows = rows.map((r, idx) => {
    if (options.mode === 'daily') {
      return {
        No: idx + 1,
        NIS: r.nis,
        'Nama Santri': r.full_name,
        'L/P': r.gender,
        Subuh: r.sessions.Subuh || '-',
        Zuhur: r.sessions.Zuhur || '-',
        Asar: r.sessions.Asar || '-',
        Magrib: r.sessions.Magrib || '-',
        Isya: r.sessions.Isya || '-',
        Hadir: r.hadir,
        Sakit: r.sakit,
        Izin: r.izin,
        Haid: r.haid,
        Alpha: r.alpha,
        'Total Sesi': r.total_sessions,
        'Kehadiran (%)': r.attendance_rate,
      };
    }
    const rowObj: Record<string, string | number> = {
      No: idx + 1,
      NIS: r.nis,
      'Nama Santri': r.full_name,
      'L/P': r.gender,
    };
    if (options.classLabel) {
      rowObj.Kelas = r.class_name;
    }
    rowObj.Hadir = r.hadir;
    rowObj.Sakit = r.sakit;
    rowObj.Izin = r.izin;
    rowObj.Haid = r.haid;
    rowObj.Alpha = r.alpha;
    rowObj['Total Sesi'] = r.total_sessions;
    rowObj['Kehadiran (%)'] = r.attendance_rate;
    return rowObj;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(wb, ws, options.mode === 'daily' ? 'Rekap Harian' : 'Rekap Bulanan');

  const metaRows = [
    ['Lembaga', settings.institution_name],
    ['Jenis Rekap', options.mode === 'daily' ? 'Rekap Absensi Harian' : 'Rekap Absensi Bulanan'],
    ['Periode', formatPeriodLabel(options.period)],
    ...(options.classLabel ? [['Kelas', options.classLabel]] : []),
    ['Mata Pelajaran', options.subjectLabel],
    ['Guru Pengampu', options.teacherLabel],
    ['Waktu Pelajaran', options.sessionLabel],
  ];
  const metaSheet = XLSX.utils.aoa_to_sheet(metaRows);
  XLSX.utils.book_append_sheet(wb, metaSheet, 'Info Rekap');

  XLSX.writeFile(wb, `rekap-absensi-${options.mode === 'daily' ? 'harian' : 'bulanan'}-${options.period}.xlsx`);
}

// 3. MONTHLY ATTENDANCE MATRIX -> PDF
export function exportMonthlyAttendancePdf(
  students: Student[],
  records: AttendanceRecord[],
  month: string,
  settings: InstitutionSettings,
  classNameLabel?: string,
  sessionLabel = 'Subuh',
  extraMeta?: { subjectLabel?: string; teacherLabel?: string }
): void {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const recordMap = new Map<string, string>();
  for (const r of records) {
    recordMap.set(`${r.student_id}-${r.date}`, r.status);
  }

  const dayHeaders = Array.from({ length: daysInMonth }, (_, idx) => String(idx + 1));
  const head = [['No', 'Nama Santri', ...dayHeaders, 'H', 'S', 'I', 'HD', 'A']];

  const body = students.map((st, idx) => {
    let h = 0, s = 0, iz = 0, hd = 0, a = 0;
    const dayCells: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`;
      const status = recordMap.get(`${st.id}-${dateStr}`) || '';
      if (status === 'H') h++;
      else if (status === 'S') s++;
      else if (status === 'I') iz++;
      else if (status === 'HD') hd++;
      else if (status === 'A') a++;
      dayCells.push(status || '-');
    }
    return [idx + 1, st.full_name, ...dayCells, h, s, iz, hd, a];
  });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const metaParts = [
    `Bulan: ${formatPeriodLabel(month)}`,
    ...(classNameLabel ? [`Kelas: ${classNameLabel}`] : []),
    ...(extraMeta?.subjectLabel ? [`Mapel: ${extraMeta.subjectLabel}`] : []),
    ...(extraMeta?.teacherLabel ? [`Pengampu: ${extraMeta.teacherLabel}`] : []),
    `Waktu: ${sessionLabel}`,
    'H=Hadir, S=Sakit, I=Izin, HD=Haid, A=Alpha',
  ];
  const startY = addPdfHeader(
    doc,
    settings,
    `MATRIKS ABSENSI BULANAN SANTRI — ${sessionLabel.toUpperCase()}`,
    metaParts.join('  |  ')
  );

  autoTable(doc, {
    startY,
    head,
    body,
    styles: { fontSize: 6.5, cellPadding: 1.1, halign: 'center' },
    headStyles: { fillColor: [6, 95, 70], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 7 },
      1: { halign: 'left', cellWidth: 42 },
    },
  });

  addPdfFooterSignature(doc, settings);
  doc.save(`absensi-bulanan-${sessionLabel.toLowerCase()}-${month}.pdf`);
}

// 4. MONTHLY ATTENDANCE MATRIX -> EXCEL
export function exportMonthlyAttendanceExcel(
  students: Student[],
  records: AttendanceRecord[],
  month: string,
  classNameLabel?: string,
  sessionLabel = 'Subuh',
  extraMeta?: { subjectLabel?: string; teacherLabel?: string }
): void {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const recordMap = new Map<string, string>();
  for (const r of records) {
    recordMap.set(`${r.student_id}-${r.date}`, r.status);
  }

  const rows = students.map((st, idx) => {
    const row: Record<string, string | number> = {
      No: idx + 1,
      NIS: st.nis,
      'Nama Santri': st.full_name,
      ...(classNameLabel ? { Kelas: classNameLabel } : {}),
      'Mata Pelajaran': extraMeta?.subjectLabel || "Tahfidz Al Qur'an",
      'Guru Pengampu': extraMeta?.teacherLabel || '-',
      'Waktu Pelajaran': sessionLabel,
    };
    let h = 0, s = 0, iz = 0, hd = 0, a = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`;
      const status = recordMap.get(`${st.id}-${dateStr}`) || '-';
      row[String(d)] = status;
      if (status === 'H') h++;
      else if (status === 'S') s++;
      else if (status === 'I') iz++;
      else if (status === 'HD') hd++;
      else if (status === 'A') a++;
    }
    row['Total Hadir'] = h;
    row['Total Sakit'] = s;
    row['Total Izin'] = iz;
    row['Total Haid'] = hd;
    row['Total Alpha'] = a;
    return row;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, `${sessionLabel} ${month}`);
  XLSX.writeFile(wb, `absensi-bulanan-${sessionLabel.toLowerCase()}-${month}.xlsx`);
}

// 5. MEMORIZATION & MUROJAAH LOGS -> PDF
export function exportMemorizationPdf(
  logs: MemorizationLog[],
  settings: InstitutionSettings,
  title: string,
  subtitle: string
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const startY = addPdfHeader(doc, settings, title, subtitle);

  autoTable(doc, {
    startY,
    head: [[
      'No', 'Tanggal', 'NIS', 'Nama Santri', 'Kelas',
      'Jenis', 'Juz', 'Surah', 'Ayat', 'Jml Ayat', 'Predikat', 'Pengampu', 'Catatan',
    ]],
    body: logs.map((l, i) => [
      i + 1,
      l.date,
      l.student_nis || '-',
      l.student_name || '-',
      l.class_name || '-',
      l.type === 'hafalan' ? 'Setoran Baru' : `Murojaah${l.murojaah_category ? ` (${l.murojaah_category})` : ''}`,
      `Juz ${l.juz}`,
      `${l.surah_number}. ${l.surah_name}`,
      `${l.ayat_start} - ${l.ayat_end}`,
      l.total_ayat,
      l.quality,
      l.ustaz_name || '-',
      l.notes || '-',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [6, 95, 70], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 21 },
      6: { halign: 'center', cellWidth: 13 },
      8: { halign: 'center', cellWidth: 17 },
      9: { halign: 'right', cellWidth: 14 },
    },
  });

  addPdfFooterSignature(doc, settings);
  doc.save(`laporan-hafalan-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// 6. MEMORIZATION & MUROJAAH LOGS -> EXCEL
export function exportMemorizationExcel(logs: MemorizationLog[]): void {
  const rows = logs.map((l, i) => ({
    No: i + 1,
    Tanggal: l.date,
    NIS: l.student_nis || '-',
    'Nama Santri': l.student_name || '-',
    Kelas: l.class_name || '-',
    Jenis: l.type === 'hafalan' ? 'Setoran Hafalan Baru' : 'Murojaah',
    'Kategori Murojaah': l.murojaah_category || '-',
    Juz: l.juz,
    'No. Surah': l.surah_number,
    Surah: l.surah_name,
    'Ayat Awal': l.ayat_start,
    'Ayat Akhir': l.ayat_end,
    'Jumlah Ayat': l.total_ayat,
    Predikat: l.quality,
    Pengampu: l.ustaz_name || '-',
    Catatan: l.notes || '-',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Setoran & Murojaah');
  XLSX.writeFile(wb, `laporan-hafalan-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// 7. MASTER STUDENTS -> EXCEL
export function exportStudentsExcel(students: Student[]): void {
  const rows = students.map((s, i) => ({
    No: i + 1,
    NIS: s.nis,
    'Nama Lengkap': s.full_name,
    'L/P': s.gender,
    'Tempat Lahir': s.birth_place,
    'Tanggal Lahir': s.birth_date,
    Kelas: s.class_name || '-',
    'Nama Wali': s.guardian_name,
    'No. HP Wali': s.guardian_phone,
    Alamat: s.address,
    'Tanggal Masuk': s.entry_date,
    'Target Juz': s.target_juz,
    'Hafalan Awal (Juz)': s.initial_juz,
    Status: s.status,
    Catatan: s.notes,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Data Santri');
  XLSX.writeFile(wb, `data-santri-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// 8. INDIVIDUAL SANTRI REPORT -> PDF
export function exportIndividualStudentPdf(
  student: Student,
  attendance: AttendanceRecord[],
  logs: MemorizationLog[],
  settings: InstitutionSettings
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = addPdfHeader(
    doc,
    settings,
    'LAPORAN PERKEMBANGAN INDIVIDU SANTRI',
    `NIS: ${student.nis}   |   Nama: ${student.full_name}   |   Kelas: ${student.class_name || '-'}`
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(`Tempat/Tgl Lahir: ${student.birth_place || '-'}, ${student.birth_date || '-'}`, 14, y);
  doc.text(`Wali Santri: ${student.guardian_name || '-'} (${student.guardian_phone || '-'})`, 14, y + 5);
  doc.text(`Target Hafalan: ${student.target_juz} Juz  |  Hafalan Awal: ${student.initial_juz} Juz  |  Status: ${student.status}`, 14, y + 10);

  let h = 0, s = 0, iz = 0, hd = 0, a = 0;
  for (const r of attendance) {
    if (r.status === 'H') h++;
    else if (r.status === 'S') s++;
    else if (r.status === 'I') iz++;
    else if (r.status === 'HD') hd++;
    else if (r.status === 'A') a++;
  }
  const totalAtt = h + s + iz + hd + a;
  const pct = totalAtt > 0 ? ((h / totalAtt) * 100).toFixed(1) : '0.0';

  doc.setFont('helvetica', 'bold');
  doc.text(`Ringkasan Kehadiran (${totalAtt} sesi tercatat): Hadir ${h} · Sakit ${s} · Izin ${iz} · Haid ${hd} · Alpha ${a} (${pct}%)`, 14, y + 18);

  autoTable(doc, {
    startY: y + 23,
    head: [['Tanggal', 'Jenis', 'Juz', 'Surah', 'Ayat', 'Predikat', 'Catatan']],
    body: logs.slice(0, 35).map((l) => [
      l.date,
      l.type === 'hafalan' ? 'Hafalan Baru' : `Murojaah (${l.murojaah_category || 'Harian'})`,
      `Juz ${l.juz}`,
      l.surah_name,
      `${l.ayat_start}-${l.ayat_end} (${l.total_ayat})`,
      l.quality,
      l.notes || '-',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [6, 95, 70], textColor: 255, fontStyle: 'bold' },
  });

  addPdfFooterSignature(doc, settings);
  doc.save(`rapor-santri-${student.nis}-${student.full_name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
}

// 9. KITAB KUNING LOGS -> PDF
export function exportKitabKuningPdf(
  logs: KitabKuningLog[],
  settings: InstitutionSettings,
  title: string,
  subtitle: string
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const startY = addPdfHeader(doc, settings, title, subtitle);

  autoTable(doc, {
    startY,
    head: [[
      'No', 'Tanggal', 'NIS', 'Nama Santri', 'Kelas',
      'Nama Kitab', 'Bidang Ilmu', 'Metode', 'Bab / Fasal', 'Predikat', 'Pengampu', 'Catatan',
    ]],
    body: logs.map((l, i) => [
      i + 1,
      l.date,
      l.student_nis || '-',
      l.student_name || '-',
      l.class_name || '-',
      l.kitab_name,
      l.fan_ilmu,
      l.method,
      l.chapter_or_bab || '-',
      l.grade,
      l.ustaz_name || '-',
      l.notes || '-',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [6, 95, 70], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 21 },
    },
  });

  addPdfFooterSignature(doc, settings);
  doc.save(`laporan-kitab-kuning-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// 10. KITAB KUNING LOGS -> EXCEL
export function exportKitabKuningExcel(logs: KitabKuningLog[]): void {
  const rows = logs.map((l, i) => ({
    No: i + 1,
    Tanggal: l.date,
    NIS: l.student_nis || '-',
    'Nama Santri': l.student_name || '-',
    Kelas: l.class_name || '-',
    'Nama Kitab': l.kitab_name,
    'Bidang Ilmu': l.fan_ilmu,
    Metode: l.method,
    'Bab / Fasal / Hal': l.chapter_or_bab || '-',
    Predikat: l.grade,
    Pengampu: l.ustaz_name || '-',
    Catatan: l.notes || '-',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Kitab Kuning');
  XLSX.writeFile(wb, `laporan-kitab-kuning-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
