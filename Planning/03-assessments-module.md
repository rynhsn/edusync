# 3. Assessments Module - Personality, Extracurricular, Kokurikuler

## 3.1 Overview
Modul Assessments mengelola penilaian non-akademik siswa:
1. **Personality Assessment** - Penilaian aspek kepribadian (generic, hardcoded aspects)
2. **Extracurricular Assessment** - Penilaian kegiatan ekstrakurikuler (linked to master_ekstrakurikuler)
3. **Kokurikuler Assessment** - Penilaian kegiatan ko-kurikuler (linked to master_kokurikuler)

Semua menggunakan skala nilai: A, B, C, D

## 3.2 Database Schema

### Tables

#### `academic_student_personality` - Personality Grades
```
- id (INT, PK, AI)
- siswa_id (INT, FK → master_siswa)
- tahun_ajaran_id (INT, FK → master_tahun_ajaran)
- aspect (VARCHAR 100) - e.g., "Kejujuran", "Kerja Sama", "Tanggung Jawab"
- grade (ENUM: 'A', 'B', 'C', 'D')
- created_at, updated_at (DATETIME)
- UNIQUE KEY: (siswa_id, tahun_ajaran_id, aspect)
```

#### `academic_student_extracurricular` - Extracurricular Grades
```
- id (INT, PK, AI)
- siswa_id (INT, FK → master_siswa)
- tahun_ajaran_id (INT, FK → master_tahun_ajaran)
- extracurricular_name (VARCHAR 100) - activity name
- grade (ENUM: 'A', 'B', 'C', 'D')
- created_at, updated_at (DATETIME)
```

#### `academic_student_kokurikuler` - Kokurikuler Grades
```
- id (INT, PK, AI)
- siswa_id (INT, FK → master_siswa)
- tahun_ajaran_id (INT, FK → master_tahun_ajaran)
- kokurikuler_name (VARCHAR 100) - activity name
- grade (ENUM: 'A', 'B', 'C', 'D')
- created_at, updated_at (DATETIME)
```

#### `master_ekstrakurikuler` - Extracurricular Activities (Master)
```
- id (INT, PK, AI)
- nama_kegiatan (VARCHAR 100) - activity name
- is_active (TINYINT, default 1) - boolean flag
- created_at, updated_at (DATETIME)
```

#### `master_kokurikuler` - Kokurikuler Activities (Master)
```
- id (INT, PK, AI)
- nama_kegiatan (VARCHAR 100) - activity name
- is_active (TINYINT, default 1) - boolean flag
- created_at, updated_at (DATETIME)
```

**Note:** If these tables don't exist initially, run SQL files:
- `create_kokurikuler_assessments.sql` - Creates missing tables
- `create_master_kokurikuler.sql` - Populates master data

## 3.3 Controllers & Methods

### `AcademicAssessmentController` - Assessment Input & Management
**Routes:** `academic-assessments/:type/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index(type)` | `GET /academic-assessments/:type` | roleAccess | Display assessment form |
| `save(type)` | `POST /academic-assessments/:type` | roleAccess + actionAccess:academic-assessments.save | Save assessments |

**Supported Types:** `personality`, `extracurricular`, `kokurikuler`

**Key Logic:**
- Type validation: only allow 3 supported types
- Load classes, academic years
- Load assessment options based on type:
  - Personality: hardcoded aspects
  - Extracurricular: from `master_ekstrakurikuler` (is_active = 1)
  - Kokurikuler: from `master_kokurikuler` (is_active = 1)
- Validate table exists (for kokurikuler); show error if missing
- Batch update/insert grades with A/B/C/D validation

## 3.4 Models

### `MasterExtracurricularModel`
```php
protected $table = 'master_ekstrakurikuler';

// Key methods:
getActiveActivities(): array
  - Returns: active extracurricular activities (is_active = 1)
  - Used in SPMB form and home page
```

### `MasterKokurikulerModel` (implicit)
```php
// Similar structure to MasterExtracurricularModel
// Queries: master_kokurikuler where is_active = 1
```

## 3.5 Assessment Aspects (Personality)

Hardcoded personality aspects in AcademicAssessmentController:
```php
$personalityAspects = [
    'Kejujuran' => 'Honesty',
    'Kerja Sama' => 'Cooperation',
    'Tanggung Jawab' => 'Responsibility',
    'Disiplin' => 'Discipline',
    'Sopan Santun' => 'Politeness',
    'Prestasi' => 'Achievement',
    // ... others
];
```

These are used to populate the form and validate grade entries.

## 3.6 Validation Rules

### Assessment Input/Update
```php
private const VALUES = ['A', 'B', 'C', 'D'];

// For each student:
'assessment[*][student_id]' => 'required|numeric',
'assessment[*][grade]' => 'required|in_list[A,B,C,D]',

// Type-specific validations
'type' => 'required|in_list[personality,extracurricular,kokurikuler]',
'kelas_id' => 'required|numeric',
'tahun_ajaran_id' => 'required|numeric',
```

## 3.7 Routes & Access Control

```php
$routes->get('academic-assessments/(:segment)', 
    'AcademicAssessmentController::index/$1',
    ['filter' => 'roleAccess:super_admin,...']);

$routes->post('academic-assessments/(:segment)', 
    'AcademicAssessmentController::save/$1',
    ['filter' => ['roleAccess:super_admin,...', 'actionAccess:academic-assessments.save', 'csrf']]);
```

## 3.8 Data Flow

### Assessment Entry Flow
```
1. User navigates to /academic-assessments/personality (or other type)
2. Select class, academic year, student
3. System loads:
   - Student list for selected class
   - Personality aspects (hardcoded)
   - Existing grades from academic_student_personality
4. Display form with:
   - Student name in each row
   - Aspect columns (A/B/C/D radio buttons or dropdown)
   - Current grades pre-selected
5. User selects grades for each (student, aspect) pair
6. Submit POST /academic-assessments/personality
7. AcademicAssessmentController::save(personality):
   - Validate type, class, year, student selections
   - Validate grade values (A/B/C/D only)
   - Batch insert/update academic_student_personality
   - Handle unique constraint: (siswa_id, tahun_ajaran_id, aspect)
8. Redirect with success/error message
```

### Conditional Table Check
```php
// In index() before rendering kokurikuler form:
$kokurikulerTableAvailable = $type !== 'kokurikuler'
    || $this->db->tableExists('academic_student_kokurikuler');

if (!$kokurikulerTableAvailable) {
    $selectionError = 'Tabel nilai Kokurikuler belum tersedia. Jalankan create_kokurikuler_assessments.sql di phpMyAdmin, lalu muat ulang halaman.';
}
// Show error message to user, disable form submission
```

## 3.9 Data Retrieval Logic

### Personality Aspects
```php
// Hardcoded (no database lookup)
$personalityAspects = [
    'Kejujuran',
    'Kerja Sama',
    'Tanggung Jawab',
    'Disiplin',
    'Sopan Santun',
    'Prestasi',
];
```

### Extracurricular Options
```php
// Query: master_ekstrakurikuler where is_active = 1
$masterActivities = $this->db->table('master_ekstrakurikuler')
    ->select('nama_kegiatan')
    ->where('is_active', 1)
    ->orderBy('nama_kegiatan')
    ->get()
    ->getResultArray();

// Extract unique names (via array_unique, array_filter, array_map)
$extracurricularOptions = array_values(
    array_unique(
        array_filter(
            array_map(
                static fn(array $row): string => trim((string) ($row['nama_kegiatan'] ?? '')),
                $masterActivities
            )
        )
    )
);
```

### Kokurikuler Options
```php
// Same pattern as extracurricular, but from master_kokurikuler
```

## 3.10 Grade Retrieval & Display

### Existing Grades
```php
// Query: academic_student_[type] where siswa_id, tahun_ajaran_id (and aspect/activity for personality/activities)
// Index by (siswa_id, aspect) or (siswa_id, activity_name) for quick lookup in form

// Display: pre-select radio button/dropdown based on existing grade
// If no grade exists, default to first option (A)
```

## 3.11 Security & Permissions

### Filters Applied
- `roleAccess:super_admin,user,kepala_sekolah,bendahara,kurikulum,operator` - View assessments
- `actionAccess:academic-assessments.save` - Save assessments

### Data Isolation
- No per-user isolation (all authenticated users can see all classes/students)
- Consider adding `actionAccess` per assessment type (e.g., `academic-assessments.personality.save`)

## 3.12 Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| Invalid assessment type | Redirect to panel with error |
| Kokurikuler table missing | Show error message; allow user to run SQL file |
| Grade value not in A/B/C/D | Validation error; re-display form |
| Student already has grade for aspect | Unique constraint update (not duplicate) |
| Delete active extracurricular/kokurikuler | Existing grades orphaned (no FK constraint enforced) |
| No students in selected class | Display empty form; allow submission (creates 0 records) |

## 3.13 Master Data Management

### Extracurricular Activities (master_ekstrakurikuler)
- Managed via AcademicDataController::index/create/update/delete('extracurriculars')
- Route: `/extracurriculars/*`
- Linked to:
  - Assessment grades (academic_student_extracurricular.extracurricular_name)
  - SPMB form footer (displayed as services)

### Kokurikuler Activities (master_kokurikuler)
- Similar structure and management
- Route: `/kokurikuler/*`
- Linked to assessment grades only

## 3.14 Related Tables & Models

### MasterExtracurricularModel
```php
public function getActiveActivities(): array
{
    return $this->where('is_active', 1)
        ->orderBy('nama_kegiatan', 'ASC')
        ->findAll();
}
```

### Other Related Models
- StudentModel → for student list per class
- AcademicYearModel → for year selection

## 3.15 Performance Considerations

- Index on (siswa_id, tahun_ajaran_id, aspect) in academic_student_personality
- Index on (siswa_id, tahun_ajaran_id) in academic_student_extracurricular/kokurikuler
- Cache master extracurricular/kokurikuler lists (rarely change)
- Paginate student lists if class has 100+ students

## 3.16 Testing Scenarios

1. **Personality Assessment:**
   - Select class, year, student
   - Assign grades (A/B/C/D) to all aspects
   - Verify unique constraint on (siswa_id, tahun_ajaran_id, aspect)
   - Update existing grades

2. **Extracurricular Assessment:**
   - Load active activities from master
   - Assign grades to each activity
   - Verify no activities shown if all is_active = 0
   - Test with various activity counts

3. **Kokurikuler Assessment:**
   - Check if table exists; show error if missing
   - Run create_kokurikuler_assessments.sql
   - Reload and verify form works
   - Assign grades

4. **Error Cases:**
   - Invalid grade value (not A/B/C/D)
   - Missing required fields
   - Non-existent academic year
   - Empty student list

## 3.17 Notes for Re-engineering

- **Hardcoded Personality Aspects:** Consider moving to master_personality_aspects table for flexibility
- **Grade Scale:** Currently A/B/C/D; could be extended to numeric or percentage scale
- **Table Existence Check:** Error handling is user-friendly but requires manual SQL file execution; consider auto-migration
- **Orphaned Records:** FK constraints not enforced; consider cascade delete or soft delete for activities

