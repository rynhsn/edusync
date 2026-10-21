# 7. Master Data Module - Classes, Students, Teachers, Majors

## 7.1 Overview
Modul Master Data mengelola data referensi/konfigurasi sistem: kelas, siswa, orang tua, guru, program/jurusan, waktu mengajar, dan status kehadiran.

**Komponen:**
- Class management (tingkat, nama, capacity)
- Student management (CRUD, import/export, status toggle)
- Parent/Guardian management
- Major/Program management (bidang keahlian)
- Time setting (jam pelajaran)
- Attendance status (custom status types)

## 7.2 Database Schema

### Tables

#### `master_kelas` - Classes/Grades
```
- kelas_id (INT, PK, AI)
- kelas_tingkat (SMALLINT) - grade level (7, 8, 9, 10, 11, 12)
- kelas_nama (VARCHAR 50) - e.g., "VII A", "X B", "XII IPA 1"
- created_at, updated_at (DATETIME)
```

#### `master_siswa` - Students
```
- siswa_id (INT, PK, AI)
- kelas_id (INT, FK → master_kelas)
- orang_tua_id (INT, FK → master_orang_tua, nullable)
- nis (VARCHAR 20, UNIQUE) - student number
- nisn (VARCHAR 10, UNIQUE) - national student ID
- nama_siswa (VARCHAR 100)
- jk (CHAR 1) - gender: 'L' (male) or 'P' (female)
- tempat_lahir (VARCHAR 100)
- tanggal_lahir (DATE)
- alamat (TEXT)
- foto (VARCHAR 500) - profile photo path
- status (VARCHAR 50) - e.g., "AKTIF", "LULUS", "MUTASI", "KELUAR"
- rfid_tag (VARCHAR 100, UNIQUE) - RFID card identifier
- created_at, updated_at (DATETIME)
- deleted_at (DATETIME) - soft delete field
```

#### `master_orang_tua` - Parents/Guardians
```
- orang_tua_id (INT, PK, AI)
- nama_orang_tua (VARCHAR 100)
- hubungan (VARCHAR 50) - relationship: "Ayah", "Ibu", "Wali"
- no_whatsapp (VARCHAR 30) - for notifications
- alamat (TEXT)
- pekerjaan (VARCHAR 100)
- no_telepon (VARCHAR 30)
- created_at, updated_at (DATETIME)
```

#### `master_guru` - Teachers
```
- guru_id (INT, PK, AI)
- guru_nip (VARCHAR 30, UNIQUE) - teacher number
- guru_nama (VARCHAR 100)
- guru_email (VARCHAR 254)
- guru_telepon (VARCHAR 30)
- created_at, updated_at (DATETIME)
```

#### `master_mapel` - Subjects
```
- mapel_id (INT, PK, AI)
- mapel_kode (VARCHAR 20, UNIQUE) - subject code
- mapel_nama (VARCHAR 100) - subject name
- mapel_keterangan (TEXT) - description
- created_at, updated_at (DATETIME)
```

#### `teacher_mapel` - Teacher-Subject Assignments
```
- assignment_id (INT, PK, AI)
- guru_id (INT, FK → master_guru)
- mapel_id (INT, FK → master_mapel)
- created_at, updated_at (DATETIME)
```

#### `master_tahun_ajaran` - Academic Years
```
- tahun_ajaran_id (INT, PK, AI)
- tahun_ajaran_nama (VARCHAR 20, UNIQUE) - e.g., "2024/2025"
- tanggal_mulai (DATE)
- tanggal_selesai (DATE)
- semester (TINYINT) - 1 or 2
- is_active (TINYINT, default 0)
- created_at, updated_at (DATETIME)
```

#### `master_jam_pelajaran` - Lesson Periods
```
- jam_pelajaran_id (INT, PK, AI)
- jam_ke (SMALLINT, UNIQUE) - period order
- jam_nama (VARCHAR 50) - period label
- jam_mulai (TIME) - start time
- jam_selesai (TIME) - end time
- created_at, updated_at (DATETIME)
```

#### `master_ekstrakurikuler` - Extracurricular Activities
```
- id (INT, PK, AI)
- nama_kegiatan (VARCHAR 100)
- is_active (TINYINT, default 1)
- created_at, updated_at (DATETIME)
```

#### `master_kokurikuler` - Co-curricular Activities
```
- id (INT, PK, AI)
- nama_kegiatan (VARCHAR 100)
- is_active (TINYINT, default 1)
- created_at, updated_at (DATETIME)
```

#### `master_program` / `master_jurusan` - Programs/Majors
```
- program_id (INT, PK, AI)
- program_name (VARCHAR 150)
- program_code (VARCHAR 50, UNIQUE)
- program_description (TEXT)
- is_active (TINYINT, default 1)
- created_at, updated_at (DATETIME)
```

#### `absensi_status_absensi` - Attendance Status (Masuk/Pulang)
```
- status_absensi_id (INT, PK)
- status_absensi (VARCHAR 50) - "Tepat Waktu", "Terlambat", etc.
- status_absensi_warna (VARCHAR 7) - hex color code
- created_at, updated_at (DATETIME)
```

#### `absensi_status_kehadiran` - Presence Status
```
- status_kehadiran_id (INT, PK)
- status_kehadiran (VARCHAR 50) - "Hadir", "Sakit", "Izin", "Alpa"
- status_kehadiran_warna (VARCHAR 7) - hex color code
- created_at, updated_at (DATETIME)
```

#### `attendance_status_logs` - Status Change History (optional)
```
- log_id (INT, PK, AI)
- siswa_id (INT, FK → master_siswa)
- tanggal (DATE)
- status_lama (VARCHAR 50)
- status_baru (VARCHAR 50)
- alasan (TEXT)
- diubah_oleh (INT, FK → auth_users)
- created_at (DATETIME)
```

## 7.3 Controllers & Methods

### `StudentController` - Student Management
**Routes:** `student/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /student` | roleAccess | List students |
| `show()` | `GET /student/show` | roleAccess | Get student data (AJAX) |
| `create()` | `POST /student/create` | actionAccess + csrf | Create student |
| `update()` | `POST /student/update/:id` | actionAccess + csrf | Update student |
| `delete()` | `POST /student/delete/:id` | actionAccess + csrf | Soft delete |
| `setStatus()` | `POST /student/status/:id` | actionAccess + csrf | Change status |
| `import()` | `POST /student/import` | actionAccess + csrf | Batch import |
| `export()` | `GET /student/export` | roleAccess | Export to Excel |
| `importTemplate()` | `GET /student/import-template` | roleAccess | Download template |

**Key Logic:**
- List with joins to class, parent, show soft-deleted excluded
- Create/update with validation
- Soft delete (not permanent)
- Import via Excel with template
- Export list to Excel

### `ClassController` - Class Management
**Routes:** `class/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /class` | roleAccess | List classes |
| `show()` | `GET /class/show` | roleAccess | Get class data (AJAX) |
| `create()` | `POST /class/create` | actionAccess + csrf | Create class |
| `saveForm()` | `POST /class/save` | actionAccess + csrf | Save (legacy) |
| `update()` | `PUT /class/update/:id` | actionAccess | Update (REST) |
| `delete()` | `DELETE /class/delete/:id` | actionAccess | Delete |
| `deleteForm()` | `POST /class/delete/:id` | actionAccess + csrf | Delete (legacy) |

### `MajorController` - Major/Program Management
**Routes:** `major/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /major` | roleAccess | List majors |
| `show()` | `GET /major/show` | roleAccess | Get major data (AJAX) |
| `create()` | `POST /major/create` | actionAccess + csrf | Create major |
| `saveForm()` | `POST /major/save` | actionAccess + csrf | Save (legacy) |
| `update()` | `PUT /major/update/:id` | actionAccess | Update (REST) |
| `delete()` | `DELETE /major/delete/:id` | actionAccess | Delete |
| `deleteForm()` | `POST /major/delete/:id` | actionAccess + csrf | Delete (legacy) |

### `TimeSettingController` - Lesson Period Configuration
**Routes:** `timesetting/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /timesetting` | roleAccess | List periods |
| `show()` | `GET /timesetting/show` | roleAccess | Get period data (AJAX) |
| `create()` | `POST /timesetting/create` | actionAccess + csrf | Create period |
| `update()` | `PUT /timesetting/update/:id` | actionAccess | Update (REST) |
| `delete()` | `DELETE /timesetting/delete/:id` | actionAccess | Delete |

### `AttendanceStatusController` - Status Configuration
**Routes:** `attendance-status/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /attendance-status` | roleAccess | List statuses |
| `save()` | `POST /attendance-status/save` | actionAccess + csrf | Create/update |
| `deleteStatus()` | `POST /attendance-status/delete/:type/:id` | actionAccess + csrf | Delete |

**Key Logic:**
- Manage status types: `absensi` (Tepat Waktu, Terlambat, etc.) and `kehadiran` (Hadir, Sakit, etc.)
- Color-coded for UI display
- Type parameter routes to correct table

### `AcademicDataController` (subset) - Master Data CRUD
**Routes:** `subjects/*`, `teachers/*`, `parents/*`, etc.

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index(type)` | `GET /{type}` | roleAccess | List |
| `create(type)` | `POST /{type}` | actionAccess | Create |
| `update(type, id)` | `POST /{type}/update/:id` | actionAccess | Update |
| `delete(type, id)` | `POST /{type}/delete/:id` | actionAccess | Delete |

**Supported Types:** subjects, teachers, parents, lesson-periods, academic-years, extracurriculars, kokurikuler

## 7.4 Models

### `StudentModel`
```php
protected $table = 'master_siswa';
protected $useSoftDeletes = true; // excludes deleted_at != NULL

getAllStudent(): array
  - JOIN with kelas, orang_tua
  - Returns all non-soft-deleted students

getStudent($condition): array|null
  - Single student by condition
  - JOINs with relationships
```

### `ClassModel`
```php
protected $table = 'master_kelas';
// Standard CRUD
```

### `MajorModel`
```php
protected $table = 'master_program' or 'master_jurusan';
// Standard CRUD
```

### `TimeSettingModel`
```php
protected $table = 'master_jam_pelajaran';
// Standard CRUD
```

## 7.5 Validation Rules

### Student Create/Update
```php
'kelas_id' => 'required|numeric',
'nama_siswa' => 'required|max_length[100]',
'nis' => 'required|max_length[20]|is_unique[master_siswa.nis]', // exclude current ID on update
'nisn' => 'required|max_length[10]|is_unique[master_siswa.nisn]',
'jk' => 'required|in_list[L,P]',
'tanggal_lahir' => 'required|valid_date[Y-m-d]',
'alamat' => 'required|max_length[1000]',
'rfid_tag' => 'max_length[100]|is_unique[master_siswa.rfid_tag]',
```

### Class Create/Update
```php
'kelas_tingkat' => 'required|numeric|greater_equal_to[7]|less_equal_to[12]',
'kelas_nama' => 'required|max_length[50]',
```

### Teacher Create/Update
```php
'guru_nip' => 'required|max_length[30]|is_unique[master_guru.guru_nip]',
'guru_nama' => 'required|max_length[100]',
'guru_email' => 'valid_email|max_length[254]',
'guru_telepon' => 'max_length[30]',
```

## 7.6 Import/Export Features

### Excel Template (Student Import)
```
Header Row: nama_siswa | nis | nisn | jk | tempat_lahir | tanggal_lahir | alamat | rfid_tag | kelas | status

Columns:
- nama_siswa: VARCHAR 100
- nis: VARCHAR 20 (must be unique)
- nisn: VARCHAR 10 (must be unique)
- jk: 'l' or 'p'
- tempat_lahir: VARCHAR 100
- tanggal_lahir: DATE (Y-m-d format)
- alamat: TEXT
- rfid_tag: VARCHAR 100 (must be unique)
- kelas: VARCHAR (e.g., "VII A") - lookup by name
- status: VARCHAR (e.g., "AKTIF") - free-text or predefined list

Skip rows containing '[CONTOH]' (example marker)
```

### Import Logic
```
1. Read Excel file
2. Validate headers
3. For each row:
   a. Skip if contains [CONTOH]
   b. Lookup kelas by name
   c. Validate required fields
   d. Check NIS/NISN uniqueness
   e. Lookup or create parent (if not exists)
   f. Insert/update student
4. Return summary: X created, Y updated, Z errors
```

### Export Format
```
Columns: nama_siswa, nis, nisn, jk, tempat_lahir, tanggal_lahir, alamat, rfid_tag, kelas_nama, status

Data: All active (non-soft-deleted) students
File: data-siswa.xlsx with timestamp
```

## 7.7 Routes & Access Control

```php
// Student CRUD
$routes->get('student', 'StudentController::index', ['filter' => 'roleAccess:super_admin,...']);
$routes->post('student/create', 'StudentController::create', ['filter' => ['actionAccess:student.create', 'csrf']]);
$routes->post('student/update/(:num)', 'StudentController::update/$1', ['filter' => ['actionAccess:student.edit', 'csrf']]);
$routes->post('student/delete/(:num)', 'StudentController::delete/$1', ['filter' => ['actionAccess:student.delete', 'csrf']]);
$routes->post('student/import', 'StudentController::import', ['filter' => ['actionAccess:student.import', 'csrf']]);
$routes->get('student/export', 'StudentController::export', ['filter' => 'roleAccess:super_admin,...']);

// Class CRUD
$routes->get('class', 'ClassController::index', ['filter' => 'roleAccess:super_admin,...']);
$routes->post('class/create', 'ClassController::create', ['filter' => ['actionAccess:class.create', 'csrf']]);
$routes->put('class/update/(:num)', 'ClassController::update/$1', ['filter' => 'actionAccess:class.edit']);

// Major CRUD
$routes->get('major', 'MajorController::index', ['filter' => 'roleAccess:super_admin,...']);
$routes->post('major/create', 'MajorController::create', ['filter' => ['actionAccess:major.create', 'csrf']]);

// Time Setting CRUD
$routes->get('timesetting', 'TimeSettingController::index', ['filter' => 'roleAccess:super_admin,...']);
$routes->post('timesetting/create', 'TimeSettingController::create', ['filter' => ['actionAccess:timesetting.manage', 'csrf']]);
$routes->put('timesetting/update/(:num)', 'TimeSettingController::update/$1', ['filter' => 'actionAccess:timesetting.manage']);

// Attendance Status
$routes->get('attendance-status', 'AttendanceStatusController::index', ['filter' => 'roleAccess:super_admin,...']);
$routes->post('attendance-status/save', 'AttendanceStatusController::save', ['filter' => ['actionAccess:attendance-status.manage', 'csrf']]);
```

## 7.8 Data Relationships

```
master_siswa
├── kelas_id → master_kelas
├── orang_tua_id → master_orang_tua
└── (linked to: absensi_absensi_sekolah, academic_student_grades, etc.)

master_kelas
└── (linked to: master_siswa, absensi_absensi_kelas)

master_guru
└── (linked to: teacher_mapel, academic_student_grades, absensi_absensi_kelas)

teacher_mapel
├── guru_id → master_guru
└── mapel_id → master_mapel

master_tahun_ajaran
└── (linked to: academic_student_grades, absensi_absensi_kelas)
```

## 7.9 Performance Considerations

- Index on kelas_id (frequent filtering by class)
- Index on (nis, nisn) for uniqueness checks on import
- Index on jk, tanggal_lahir for filtering/reporting
- Cache list of active classes (rarely change)
- Paginate student list in UI (DataTables)
- Lazy-load parent details on detail view
- Soft delete: never hard-delete (audit trail); query excludes deleted_at IS NOT NULL

## 7.10 Testing Scenarios

1. **Student CRUD:**
   - Create with all required fields
   - Duplicate NIS/NISN (should fail)
   - Update student details
   - Soft delete (verify data still in DB)
   - Import from Excel template

2. **Class Management:**
   - Create class with valid tingkat (7-12)
   - Update class name
   - List students in class

3. **Master Data:**
   - Create subject, teacher, parent, academic year
   - Verify unique constraints (NIP, NISN, etc.)
   - Delete with existing foreign keys (FK constraint)

## 7.11 Notes for Re-engineering

- **Soft Delete:** Students soft-deleted but not shown in UI; no "restore" feature
- **RFID Tag:** Unique but nullable; allows multiple students without tag
- **Parent Linking:** Optional (orang_tua_id nullable); not all students linked
- **Status Field:** Free-text (no predefined list); should standardize
- **Gender:** CHAR(1) with 'L'/'P'; could use BOOLEAN or ENUM
- **Import:** No transaction handling; partial failure could corrupt data
- **Archive:** No archive feature; old academic years mixed with active ones
- **Soft Delete Cleanup:** No feature to permanently delete old soft-deleted records

