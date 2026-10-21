# 1. Attendance Module - RFID & Class Attendance

## 1.1 Overview
Modul Attendance mengelola dua jenis absensi:
1. **RFID Attendance** - Kiosk berbasis RFID untuk pencatatan kehadiran real-time siswa
2. **Class Attendance** - Pencatatan absensi per kelas/mata pelajaran oleh guru

## 1.2 Database Schema

### Tables

#### `absensi_absensi_sekolah` - RFID Attendance Log
```
- absensi_id (INT, PK, AI)
- siswa_id (INT, FK → master_siswa)
- tanggal (DATE)
- waktu_masuk (TIME)
- waktu_pulang (TIME)
- waktu_masuk_aktual (TIME) - actual tap-in time
- waktu_pulang_aktual (TIME) - actual tap-out time
- status_kehadiran_id (INT, FK → absensi_status_kehadiran)
- status_absensi_masuk_id (INT, FK → absensi_status_absensi)
- status_absensi_pulang_id (INT, FK → absensi_status_absensi)
- keterangan (TEXT) - notes/remarks
- created_at, updated_at (DATETIME)
```

#### `absensi_absensi_kelas` - Class Attendance Session
```
- absensi_kelas_id (INT, PK, AI)
- kelas_id (INT, FK → master_kelas)
- mapel_id (INT, FK → master_mapel)
- guru_id (INT, FK → master_guru)
- jam_pelajaran_id (INT, FK → master_jam_pelajaran)
- tahun_ajaran_id (INT, FK → master_tahun_ajaran)
- tanggal (DATE)
- dicatat_oleh (INT, FK → auth_users)
- created_at, updated_at (DATETIME)
- UNIQUE KEY: (kelas_id, mapel_id, jam_pelajaran_id, tahun_ajaran_id, tanggal)
```

#### `absensi_absensi_kelas_siswa` - Class Attendance Student Record
```
- absensi_kelas_siswa_id (INT, PK, AI)
- absensi_kelas_id (INT, FK → absensi_absensi_kelas)
- siswa_id (INT, FK → master_siswa)
- status (ENUM: 'hadir', 'sakit', 'izin', 'alpa') - default: 'hadir'
- keterangan (VARCHAR 500) - notes
- created_at, updated_at (DATETIME)
- UNIQUE KEY: (absensi_kelas_id, siswa_id)
```

#### `absensi_status_kehadiran` - Attendance Status Types
```
- status_kehadiran_id (INT, PK)
- status_kehadiran (VARCHAR)
- status_kehadiran_warna (VARCHAR) - hex color code
- created_at, updated_at (DATETIME)
```

#### `absensi_status_absensi` - Absence Status (Masuk/Pulang)
```
- status_absensi_id (INT, PK)
- status_absensi (VARCHAR)
- status_absensi_warna (VARCHAR) - hex color code
- created_at, updated_at (DATETIME)
```

#### `master_jam_pelajaran` - Lesson Periods
```
- jam_pelajaran_id (INT, PK, AI)
- jam_ke (SMALLINT) - period number (1, 2, 3, ...)
- jam_nama (VARCHAR 50) - period name
- jam_mulai (TIME) - start time
- jam_selesai (TIME) - end time
- created_at, updated_at (DATETIME)
- UNIQUE KEY: jam_ke
```

#### `attendance_status_logs` - Attendance Status Change Logs
```
- log_id (INT, PK, AI)
- siswa_id (INT, FK)
- tanggal (DATE)
- status_id (INT)
- alasan (TEXT)
- created_at (DATETIME)
```

## 1.3 Controllers & Methods

### `AttendanceController` - RFID Kiosk & Management
**Routes:** `attendance/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `attendance()` | `GET /attendance` | Public | Display RFID kiosk interface |
| `index()` | `GET /attendance/manage` | roleAccess | List all attendance records |
| `tap()` | `POST /attendance/tap` | Public | Process RFID tap event |
| `show()` | `GET /attendance/show` | Public | Get attendance data (AJAX) |
| `report()` | `GET /report/attendance` | roleAccess | View attendance report |
| `downloadReportPdf()` | `GET /report/attendance/pdf` | roleAccess | Export report as PDF |

**Key Logic:**
- Public endpoint for kiosk; secured endpoints need roleAccess filter
- `tap()` receives RFID tag, updates `waktu_masuk_aktual` or `waktu_pulang_aktual`
- Auto-calculates `status_kehadiran_id` based on time vs. schedule
- Report supports date range and student name filtering

### `ClassAttendanceController` - Teacher Class Attendance
**Routes:** `class-attendance/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /class-attendance` | roleAccess | List class attendance sessions |
| `create()` | `GET /class-attendance/create` | actionAccess:class-attendance.create | Show form |
| `store()` | `POST /class-attendance` | actionAccess:class-attendance.create | Create attendance session |
| `edit()` | `GET /class-attendance/:id/edit` | actionAccess:class-attendance.edit | Show edit form |
| `update()` | `POST /class-attendance/:id` | actionAccess:class-attendance.edit | Update session |
| `show()` | `GET /class-attendance/:id` | roleAccess | View session details |
| `delete()` | `POST /class-attendance/:id/delete` | actionAccess:class-attendance.delete | Delete session |
| `downloadPdf()` | `GET /class-attendance/:id/pdf` | roleAccess | Export as PDF |
| `monthlyReport()` | `GET /class-attendance-report` | roleAccess | Monthly summary |
| `downloadMonthlyReportPdf()` | `GET /class-attendance-report/pdf` | roleAccess | Export monthly PDF |
| `resendWhatsApp()` | `POST /class-attendance/:id/resend-whatsapp` | actionAccess:class-attendance.whatsapp | Resend WhatsApp notification |

**Key Logic:**
- Teacher selects class, subject, period, academic year, date
- System auto-loads student list for that class
- Batch update attendance status with optional notes
- WhatsApp integration: sends notifications to parents (via Fonnte API)
- PDF export via Dompdf with student list and status summary

### `ExtracurricularAttendanceController` - Extra-curricular Activities
**Routes:** `extracurricular-attendance/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /extracurricular-attendance` | roleAccess | List extracurricular sessions |
| `save()` | `POST /extracurricular-attendance/save` | actionAccess | Create/update session |
| `report()` | `GET /report/extracurricular-attendance` | roleAccess | View report |
| `downloadMonthlyStudentReportPdf()` | `GET /report/extracurricular-attendance/pdf` | roleAccess | Export PDF |

## 1.4 Models

### `AttendanceModel`
```php
protected $table = 'absensi_absensi_sekolah';
protected $primaryKey = 'absensi_id';

// Key methods:
getAttendance(?$condition): array
  - Joins: siswa, kelas, status_kehadiran, status_absensi (masuk/pulang)
  - Returns: full attendance records with student & status names

getAttendanceReport(?$dateFrom, ?$dateTo, ?$studentName): array
  - Filters by date range and student name
  - Left joins to handle missing relationships
  - Ordered by student name, then date DESC
```

### `AttendanceStatusModel`
```php
protected $table = 'absensi_status_absensi';
// Enum-like: Tepat Waktu, Terlambat, Pulang Cepat, etc.
```

### `AbsenceStatusModel`
```php
// Represents attendance statuses: Hadir, Sakit, Izin, Alpa
```

### `TimeSettingModel`
```php
// Configurable time thresholds for:
// - Waktu mulai (start time)
// - Waktu akhir (end time)
// - Batas waktu terlambat (late threshold)
// - Hari libur (free days)
```

## 1.5 Routes & Access Control

```php
// Public RFID endpoints
$routes->get('attendance', 'AttendanceController::attendance');
$routes->get('attendance/kiosk', 'AttendanceController::attendance');
$routes->group('attendance', function ($routes) {
    $routes->post('tap', 'AttendanceController::tap');
    $routes->get('show', 'AttendanceController::show');
});

// Managed attendance (requires authentication)
$routes->get('attendance/manage', ['filter' => 'roleAccess:super_admin,...']);

// Class attendance (teacher/admin)
$routes->group('class-attendance', [
    'filter' => 'roleAccess:super_admin,...'
], function ($routes) {
    $routes->get('/', 'ClassAttendanceController::index');
    $routes->get('create', 'ClassAttendanceController::create', ['filter' => 'actionAccess:class-attendance.create']);
    $routes->post('/', 'ClassAttendanceController::store');
    // ... etc
});

// Reports
$routes->get('report/attendance', ['filter' => 'roleAccess:super_admin,...']);
$routes->get('report/attendance/pdf', ['filter' => 'roleAccess:super_admin,...']);
$routes->get('class-attendance-report', ['filter' => 'roleAccess:super_admin,...']);
```

## 1.6 Validation Rules

### RFID Tap
```php
// In tap() method:
- rfid_tag: required, format validation
- timestamp: required, valid datetime
```

### Class Attendance Create/Update
```php
- kelas_id: required|numeric
- mapel_id: required|numeric
- guru_id: required|numeric
- jam_pelajaran_id: required|numeric
- tahun_ajaran_id: required|numeric
- tanggal: required|valid_date[Y-m-d]
- siswa[*][status]: in_list[hadir,sakit,izin,alpa]
- siswa[*][keterangan]: max_length[500]
```

## 1.7 Data Flow

### RFID Attendance Flow
```
1. Student taps RFID card on kiosk
2. Frontend sends POST /attendance/tap with RFID tag
3. AttendanceController::tap() processes:
   - Find student by rfid_tag
   - Check if record exists for today
   - If first tap → set waktu_masuk_aktual
   - If second tap → set waktu_pulang_aktual
   - Calculate status based on time thresholds
4. Insert/update absensi_absensi_sekolah
5. Return JSON response to kiosk
```

### Class Attendance Flow
```
1. Teacher navigates to /class-attendance/create
2. Selects class, subject, lesson period, date
3. System queries absensi_absensi_kelas_siswa for all students in class
4. Teacher marks status (hadir/sakit/izin/alpa) for each student
5. Optional: add keterangan (notes)
6. Teacher submits form
7. ClassAttendanceController::store():
   - Create absensi_absensi_kelas record (unique constraint check)
   - Create absensi_absensi_kelas_siswa records for each student
   - Trigger notifyParentsAboutAttendance() if enabled
8. Send WhatsApp notifications to parents (async/queue recommended)
9. Redirect with success message
```

## 1.8 Key Features & Implementation Details

### Time-based Status Calculation
- Configurable via `master_jam_pelajaran` and time settings
- Status mapping: on-time, late, early-leave, absent
- Color-coded visualization (via `status_kehadiran_warna`, `status_absensi_warna`)

### WhatsApp Integration
- **Library:** `Fonnte API`
- **Trigger:** After class attendance submission
- **Message Template:** Student name, class, date, status, notes
- **Recipients:** Parent phone (from `master_orang_tua.no_whatsapp`)
- **Configuration:** `docs/whatsapp-attendance-setup.md`

### Bulk Operations
- Import attendance via CSV/Excel (StudentController pattern)
- Batch update class attendance
- Monthly report generation

### Soft Delete
- StudentModel uses `$useSoftDeletes = true`
- Attendance records for soft-deleted students excluded from active reports

## 1.9 Related Tables (Master Data)

- `master_siswa` - Student records (links to absensi)
- `master_kelas` - Class/grade info
- `master_mapel` - Subjects
- `master_guru` - Teachers
- `master_orang_tua` - Parents (for WhatsApp notifications)
- `master_tahun_ajaran` - Academic year/semester
- `auth_users` - User who recorded attendance (dicatat_oleh)

## 1.10 Security & Permissions

### Filters Applied
- `roleAccess:super_admin,user,kepala_sekolah,bendahara,kurikulum,operator` - View & manage
- `actionAccess:class-attendance.create` - Create new session
- `actionAccess:class-attendance.edit` - Edit existing session
- `actionAccess:class-attendance.delete` - Delete session
- `actionAccess:class-attendance.whatsapp` - Resend WhatsApp

### RFID Kiosk
- Public endpoint (no authentication)
- IP whitelisting recommended (deploy-time config)

## 1.11 Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| Invalid RFID tag | Log error, display error on kiosk, no record created |
| Duplicate class attendance session | Unique constraint violation caught; show error |
| Missing student in class | Mark as alpa (absent); notification sent |
| WhatsApp delivery failure | Log error; do not block attendance save |
| PDF generation failure | Return 500 error with message |
| Soft-deleted student taps kiosk | Exclude from active reports; can re-activate |

## 1.12 Performance Considerations

- Index on `tanggal` (absensi_absensi_sekolah) for daily reports
- Index on `siswa_id` (absensi_absensi_kelas_siswa) for student lookups
- Limit report queries with date range (avoid year-long scans)
- Paginate attendance lists in UI (DataTables)
- Consider queue/job for WhatsApp batch sends (high volume)

## 1.13 Testing Scenarios

1. **RFID Kiosk:**
   - Single tap (check-in)
   - Double tap (check-out)
   - Invalid tag
   - No network / offline mode (if implemented)

2. **Class Attendance:**
   - Create session with all students present
   - Update student status (hadir → sakit)
   - Delete session
   - Generate & download PDF
   - Resend WhatsApp notification

3. **Reports:**
   - Filter by date range
   - Search by student name
   - Export PDF (verify formatting, data accuracy)
   - Soft-deleted students excluded

