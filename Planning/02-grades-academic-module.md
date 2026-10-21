# 2. Grades & Academic Module

## 2.1 Overview
Modul Grades mengelola input nilai siswa per subject, dengan dukungan komponen nilai:
- Nilai UTS (Mid-term exam)
- Nilai UAS (Final exam)
- Nilai Pengetahuan (Knowledge)
- Nilai Praktik (Practice/Practical)

Setiap nilai dalam skala 0-100.

## 2.2 Database Schema

### Tables

#### `academic_student_grades` - Student Grades
```
- grade_id (INT, PK, AI)
- siswa_id (INT, FK → master_siswa)
- kelas_id (INT, FK → master_kelas)
- mapel_id (INT, FK → master_mapel)
- guru_id (INT, FK → master_guru) - teacher who inputs
- tahun_ajaran_id (INT, FK → master_tahun_ajaran)
- semester (TINYINT) - 1 or 2
- nilai_uts (INT, default 0) - 0-100
- nilai_uas (INT, default 0) - 0-100
- nilai_pengetahuan (INT, default 0) - nullable, conditional field
- nilai_praktik (INT, default 0) - 0-100
- created_at, updated_at (DATETIME)
- UNIQUE KEY: (siswa_id, mapel_id, tahun_ajaran_id, semester)
```

#### `master_mapel` - Subjects (Masters)
```
- mapel_id (INT, PK, AI)
- mapel_kode (VARCHAR 20) - subject code
- mapel_nama (VARCHAR 100) - subject name
- mapel_keterangan (TEXT) - description
- created_at, updated_at (DATETIME)
- UNIQUE KEY: mapel_kode
```

#### `master_guru` - Teachers (Masters)
```
- guru_id (INT, PK, AI)
- guru_nip (VARCHAR 30) - ID number
- guru_nama (VARCHAR 100) - name
- guru_email (VARCHAR 254) - email
- guru_telepon (VARCHAR 30) - phone
- created_at, updated_at (DATETIME)
- UNIQUE KEY: guru_nip
```

#### `teacher_mapel` - Teacher-Subject Assignments
```
- assignment_id (INT, PK, AI)
- guru_id (INT, FK → master_guru)
- mapel_id (INT, FK → master_mapel)
- created_at, updated_at (DATETIME)
- UNIQUE KEY: (guru_id, mapel_id)
```

#### `master_tahun_ajaran` - Academic Years
```
- tahun_ajaran_id (INT, PK, AI)
- tahun_ajaran_nama (VARCHAR 20) - e.g., "2024/2025"
- tanggal_mulai (DATE) - start date
- tanggal_selesai (DATE) - end date
- semester (TINYINT) - 1 or 2
- is_active (TINYINT, default 0) - boolean flag
- created_at, updated_at (DATETIME)
- UNIQUE KEY: tahun_ajaran_nama
```

#### `master_kelas` - Classes
```
- kelas_id (INT, PK, AI)
- kelas_tingkat (SMALLINT) - grade level (7, 8, 9, etc.)
- kelas_nama (VARCHAR 50) - e.g., "VII A"
- created_at, updated_at (DATETIME)
```

## 2.3 Controllers & Methods

### `GradeController` - Grade Input & Management
**Routes:** `grades/*`, `report/grades/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /grades` | roleAccess | Display grade input form |
| `save()` | `POST /grades` | roleAccess + actionAccess:grades.save | Save grade records |
| `student()` | `GET /grades/student/:id` | roleAccess | View single student grades |

**Key Logic:**
- Load classes, academic years, subjects, teachers
- Auto-load teacher-subject assignments
- Filter students by selected class
- Batch update grades with validation
- Conditional field: `nilai_pengetahuan` (check if column exists)

### `GradeReportController` - Grade Reporting
**Routes:** `report/grades/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /report/grades` | roleAccess | Display grade report |
| `download()` | `GET /report/grades/pdf` | roleAccess | Export as PDF |

**Key Logic:**
- Filter by class, subject, academic year, semester
- Generate report with grade statistics (avg, min, max)
- PDF export via Dompdf

### `AcademicDataController` - Master Data Management
**Routes:** `subjects/*`, `teachers/*`, `lesson-periods/*`, `academic-years/*`, etc.

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index(type)` | `GET /{type}` | roleAccess | List master data |
| `create(type)` | `POST /{type}` | actionAccess | Create entry |
| `update(type, id)` | `POST /{type}/update/:id` | actionAccess | Update entry |
| `delete(type, id)` | `POST /{type}/delete/:id` | actionAccess | Delete entry |

**Supported Types:**
- `subjects` - Master subjects
- `teachers` - Master teachers
- `lesson-periods` - Master lesson periods (jam_pelajaran)
- `academic-years` - Master academic years
- `extracurriculars` - Master extracurricular activities
- `kokurikuler` - Master co-curricular activities
- `parents` - Master parents (orang_tua)

### `TeacherSubjectController` - Teacher Assignments
**Routes:** `teacher-subjects/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /teacher-subjects` | roleAccess | List assignments |
| `save()` | `POST /teacher-subjects` | actionAccess:teacher-subjects.save | Create/update |

**Key Logic:**
- Assign teachers to subjects (many-to-many)
- Store in `teacher_mapel` table
- Used by GradeController to filter available teachers

## 2.4 Models

### `GradeModel` (implicit in GradeController)
```php
// Not explicitly defined; uses direct DB queries in controller
// Queries: academic_student_grades with joins to siswa, mapel, guru
```

### Master Data Models
- `SubjectModel` → `master_mapel`
- `TeacherModel` → `master_guru`
- `ClassModel` → `master_kelas`
- `AcademicYearModel` → `master_tahun_ajaran`

## 2.5 Validation Rules

### Grade Input/Update
```php
'nilai_uts' => 'numeric|greater_equal_to[0]|less_equal_to[100]',
'nilai_uas' => 'numeric|greater_equal_to[0]|less_equal_to[100]',
'nilai_pengetahuan' => 'numeric|greater_equal_to[0]|less_equal_to[100]', // conditional
'nilai_praktik' => 'numeric|greater_equal_to[0]|less_equal_to[100]',
```

### Master Data Creation
```php
// Subjects
'mapel_kode' => 'required|max_length[20]|is_unique[master_mapel.mapel_kode]',
'mapel_nama' => 'required|max_length[100]',

// Teachers
'guru_nip' => 'required|max_length[30]|is_unique[master_guru.guru_nip]',
'guru_nama' => 'required|max_length[100]',
'guru_email' => 'valid_email|max_length[254]',

// Academic Years
'tahun_ajaran_nama' => 'required|is_unique[master_tahun_ajaran.tahun_ajaran_nama]',
'tanggal_mulai' => 'valid_date[Y-m-d]',
'tanggal_selesai' => 'valid_date[Y-m-d]',
```

## 2.6 Routes & Access Control

```php
// Grade Management
$routes->get('grades', 'GradeController::index', 
    ['filter' => 'roleAccess:super_admin,user,kepala_sekolah,bendahara,kurikulum,operator']);
$routes->get('grades/student/(:num)', 'GradeController::student/$1',
    ['filter' => 'roleAccess:...']);
$routes->post('grades', 'GradeController::save',
    ['filter' => ['roleAccess:...', 'actionAccess:grades.save', 'csrf']]);

// Grade Reports
$routes->get('report/grades', 'GradeReportController::index',
    ['filter' => 'roleAccess:...']);
$routes->get('report/grades/pdf', 'GradeReportController::download',
    ['filter' => 'roleAccess:...']);

// Master Data CRUD
$routes->get('subjects', 'AcademicDataController::index/subjects',
    ['filter' => 'roleAccess:...']);
$routes->post('subjects', 'AcademicDataController::create/subjects',
    ['filter' => ['actionAccess:subjects.create', 'csrf']]);
$routes->post('subjects/update/(:num)', 'AcademicDataController::update/subjects/$1',
    ['filter' => ['actionAccess:subjects.edit', 'csrf']]);
$routes->post('subjects/delete/(:num)', 'AcademicDataController::delete/subjects/$1',
    ['filter' => ['actionAccess:subjects.delete', 'csrf']]);

// Teacher Assignments
$routes->get('teacher-subjects', 'TeacherSubjectController::index',
    ['filter' => 'roleAccess:...']);
$routes->post('teacher-subjects', 'TeacherSubjectController::save',
    ['filter' => ['actionAccess:teacher-subjects.save', 'csrf']]);

// Similar patterns for teachers, lesson-periods, academic-years, etc.
```

## 2.7 Data Flow

### Grade Input Flow
```
1. Teacher navigates to /grades
2. Selects: class, academic year, subject, teacher (optional)
3. System queries academic_student_grades for:
   - All students in selected class
   - Existing grades for (siswa, mapel, tahun_ajaran, semester)
4. Display form with student rows + grade input fields
5. Teacher enters nilai_uts, nilai_uas, nilai_pengetahuan, nilai_praktik
6. Validates:
   - All values 0-100
   - Required fields not empty
   - No duplicate entry (unique constraint)
7. Controller::save():
   - Batch insert/update academic_student_grades
   - Each student gets one record (unique on siswa_id, mapel_id, tahun_ajaran_id, semester)
8. Redirect with success message
```

### Master Data Management Flow
```
1. Admin navigates to /subjects (or /teachers, /academic-years, etc.)
2. Display list with pagination/search
3. Click "Add" → form opens
4. Fill in required fields (validation rules applied)
5. Submit POST /{type}
6. AcademicDataController::create(type):
   - Validate input
   - Insert into appropriate table
   - Redirect with success/error message
7. Similar flow for update/delete operations
```

## 2.8 Key Features

### Conditional Field: `nilai_pengetahuan`
- Column may not exist in older installations
- GradeController checks: `$this->db->fieldExists('nilai_pengetahuan', 'academic_student_grades')`
- If exists, include in display & validation
- If not, set to NULL in queries

### Teacher-Subject Assignments
- Many-to-many relationship via `teacher_mapel`
- When inputting grades, filter teachers by selected subject
- Used to enforce data consistency (only assigned teachers can input grades)

### Academic Year & Semester
- System supports multiple academic years (e.g., 2024/2025, 2025/2026)
- Each year can have semester 1 & 2
- `is_active` flag marks current/active academic year
- Grades unique per (siswa, mapel, tahun_ajaran, semester)

### Grade Calculation & Reporting
- Report aggregates grades by class/subject
- Calculates avg, min, max per subject
- PDF export with formatted table & statistics

## 2.9 Security & Permissions

### Filters Applied
- `roleAccess:super_admin,user,kepala_sekolah,bendahara,kurikulum,operator` - View grades
- `actionAccess:grades.save` - Input/update grades
- `actionAccess:subjects.create` - Create subjects
- `actionAccess:subjects.edit` - Edit subjects
- `actionAccess:subjects.delete` - Delete subjects
- Similar for teachers, academic-years, etc.

### Data Isolation
- Teachers can only input grades for subjects they're assigned to
- Implementation: filter teacher dropdown in GradeController

## 2.10 Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| Grade value outside 0-100 | Validation error; re-display form |
| Duplicate (siswa, mapel, tahun_ajaran, semester) | Unique constraint error caught; show message |
| Non-existent teacher assigned | FK constraint error; prevent save |
| Delete subject with existing grades | FK constraint error; prevent delete (soft-delete recommended) |
| Update academic year to inactive | Mark as inactive; new grades use active year |

## 2.11 Related Tables & Relationships

```
academic_student_grades
├── siswa_id → master_siswa
├── kelas_id → master_kelas
├── mapel_id → master_mapel
├── guru_id → master_guru
└── tahun_ajaran_id → master_tahun_ajaran

teacher_mapel
├── guru_id → master_guru
└── mapel_id → master_mapel
```

## 2.12 Performance Considerations

- Index on (siswa_id, mapel_id, tahun_ajaran_id, semester) for grade lookups
- Index on (guru_id, mapel_id) in teacher_mapel for assignment queries
- Paginate master data lists (DataTables)
- Cache active academic year (rarely changes)
- Batch insert/update (not row-by-row) for performance

## 2.13 Testing Scenarios

1. **Grade Input:**
   - Valid grades (0-100)
   - Invalid grades (> 100, < 0, non-numeric)
   - Duplicate entry (unique constraint)
   - Missing required fields
   - Soft-deleted students excluded

2. **Master Data:**
   - Create, read, update, delete subjects
   - Create, read, update, delete teachers
   - Validate unique constraints (mapel_kode, guru_nip, tahun_ajaran_nama)
   - Delete with existing foreign keys (should fail or cascade)

3. **Reports:**
   - Generate report with filters
   - Export PDF (verify formatting)
   - Conditional field `nilai_pengetahuan` handling

