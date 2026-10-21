# 4. SPMB Module - Online Student Registration

## 4.1 Overview
Modul SPMB (Sistem Pendaftaran Siswa Baru / New Student Registration System) mengelola formulir pendaftaran peserta didik baru online.

**Fitur:**
- Public form submission (tidak memerlukan login)
- Document upload (5 required documents)
- Parent information capture
- WhatsApp notification (optional)
- Proof generation (PDF)
- Admin approval workflow

## 4.2 Database Schema

### Tables

#### `spmb_applications` - SPMB Application Records
```
- application_id (INT, PK, AI)
- contact_email (VARCHAR 254) - contact email
- contact_phone (VARCHAR 30) - contact phone
- parent_phone (VARCHAR 30) - parent WhatsApp
- student_nik (VARCHAR 16) - 16-digit NIK
- student_nisn (VARCHAR 10) - 10-digit NISN
- student_name (VARCHAR 150)
- gender (CHAR 1) - 'L' or 'P'
- birth_place (VARCHAR 100)
- birth_date (DATE)
- address (VARCHAR 1000)
- rt (VARCHAR 5) - neighborhood unit
- rw (VARCHAR 5) - community unit
- postal_code (VARCHAR 10)
- province (VARCHAR 100)
- regency (VARCHAR 100)
- district (VARCHAR 100)
- village (VARCHAR 100)
- previous_school (VARCHAR 200) - sekolah asal
- graduation_year (YEAR)
- education_level (VARCHAR 50) - e.g., "SD", "SMP"
- parent_name (VARCHAR 150)
- parent_relationship (VARCHAR 50) - e.g., "Ayah", "Ibu"
- parent_job (VARCHAR 100)
- documents_submitted (TINYINT, default 0) - boolean
- submitted_at (DATETIME)
- created_at, updated_at (DATETIME)
```

#### `spmb_application_documents` - Uploaded Documents
```
- document_id (INT, PK, AI)
- application_id (INT, FK → spmb_applications)
- document_type (VARCHAR 50) - family_card, birth_certificate, etc.
- file_path (VARCHAR 500) - path relative to WRITEPATH/uploads/spmb
- file_size (INT) - bytes
- mime_type (VARCHAR 100)
- uploaded_at (DATETIME)
- created_at (DATETIME)
```

#### `spmb_proof_records` - Generated Proofs (for download)
```
- proof_id (INT, PK, AI)
- application_id (INT, FK → spmb_applications)
- proof_type (VARCHAR 50) - e.g., 'registration_receipt'
- generated_at (DATETIME)
- expires_at (DATETIME)
```

## 4.3 Controller & Methods

### `SpmbController` - Registration Form & Management
**Routes:** `news/spmb/*`, `spmb/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `form()` | `GET /news/spmb` | Public | Display registration form |
| `submit()` | `POST /news/spmb/submit` | Public + csrf | Process form submission |
| `applications()` | `GET /spmb/applications` | adminAuth | List all applications |
| `proof()` | `GET /spmb/applications/:id/proof` | adminAuth | Generate proof PDF |
| `document()` | `GET /spmb/applications/:id/documents/:type` | adminAuth | Download document |

**Key Logic:**
- Honeypot field validation (spam protection)
- Document upload (5 required documents, max 2MB each)
- Batch validation (all required fields)
- File storage in WRITEPATH/uploads/spmb/:application_id/
- PDF generation for proof of registration

## 4.4 Models

### `SpmbApplicationModel`
```php
protected $table = 'spmb_applications';
protected $primaryKey = 'application_id';

// Key methods:
getAllApplications(): array
  - Returns all applications with document counts

getApplicationWithDocuments(int $id): array
  - Returns single application + all associated documents
```

## 4.5 Document Types

```php
private const DOCUMENTS = [
    'family_card' => [
        'label' => 'Kartu Keluarga (KK)',
        'required' => true,
        'image_only' => false  // accepts PDF too
    ],
    'birth_certificate' => [
        'label' => 'Akta kelahiran / surat keterangan lahir',
        'required' => true,
        'image_only' => false
    ],
    'guardian_identity' => [
        'label' => 'KTP orang tua / wali',
        'required' => true,
        'image_only' => false
    ],
    'previous_school_certificate' => [
        'label' => 'Ijazah / SKL jenjang sebelumnya',
        'required' => true,
        'image_only' => false
    ],
    'recent_photo' => [
        'label' => 'Pas foto terbaru',
        'required' => true,
        'image_only' => true  // only JPG/PNG
    ],
];
```

## 4.6 Validation Rules

### Form Submission
```php
'contact_email' => 'required|valid_email|max_length[254]',
'contact_phone' => 'required|regex_match[/^[0-9+().\-\s]{8,25}$/]',
'parent_phone' => 'required|regex_match[/^[0-9+().\-\s]{8,25}$/]',

// Student Data
'student_nik' => 'required|regex_match[/^[0-9]{16}$/]',  // 16 digits
'student_nisn' => 'required|regex_match[/^[0-9]{10}$/]',  // 10 digits
'student_name' => 'required|max_length[150]',
'gender' => 'required|in_list[L,P]',
'birth_place' => 'required|max_length[100]',
'birth_date' => 'required|valid_date[Y-m-d]',
'address' => 'required|max_length[1000]',

// Parent Data
'parent_name' => 'required|max_length[150]',
'parent_relationship' => 'required|in_list[Ayah,Ibu,Wali,Lainnya]',
'parent_job' => 'required|max_length[100]',

// Documents
'family_card' => 'uploaded[family_card]|max_size[family_card,2048]',
'birth_certificate' => 'uploaded[birth_certificate]|max_size[birth_certificate,2048]',
// ... etc for all required documents
```

### Document Upload
```php
// File type validation
- family_card: PDF, JPG, PNG (not image_only)
- birth_certificate: PDF, JPG, PNG
- guardian_identity: PDF, JPG, PNG
- previous_school_certificate: PDF, JPG, PNG
- recent_photo: JPG, PNG only

// Size
- Max 2MB per file (2048 KB)

// Honeypot (spam protection)
- website field must be empty (hidden via CSS)
```

## 4.7 Routes & Access Control

```php
// Public registration
$routes->get('news/spmb', 'SpmbController::form');
$routes->post('news/spmb/submit', 'SpmbController::submit', ['filter' => 'csrf']);

// Admin management (requires super_admin)
$routes->get('spmb/applications', 'SpmbController::applications', ['filter' => 'adminAuth']);
$routes->get('spmb/applications/(:num)/proof', 'SpmbController::proof/$1', ['filter' => 'adminAuth']);
$routes->get('spmb/applications/(:num)/documents/(:segment)', 'SpmbController::document/$1/$2', ['filter' => 'adminAuth']);
```

## 4.8 File Structure

### Upload Path
```
WRITEPATH/uploads/spmb/
├── {application_id}/
│   ├── family_card.{ext}
│   ├── birth_certificate.{ext}
│   ├── guardian_identity.{ext}
│   ├── previous_school_certificate.{ext}
│   └── recent_photo.{ext}
```

**Note:** Application ID used for folder organization to avoid filename collisions and enable easy per-application cleanup.

## 4.9 Data Flow

### Registration Submission Flow
```
1. Visitor navigates to /news/spmb
2. System loads school contact settings (for display)
3. Load extracurricular options (for footer/display)
4. Display form with:
   - Contact info section
   - Student personal data
   - Address (full details: RT, RW, postal, province, etc.)
   - Education history
   - Parent/guardian info
   - Document upload section (5 files required)
5. Visitor fills form, uploads documents
6. Visitor submits (POST /news/spmb/submit)
7. SpmbController::submit():
   a. Check honeypot (reject if website field not empty)
   b. Validate all form fields (email, phone, NIK/NISN format, date, etc.)
   c. Validate document uploads (presence, size, format)
   d. Create spmb_applications record
   e. Move uploaded files to WRITEPATH/uploads/spmb/{app_id}/
   f. Create spmb_application_documents records for each file
   g. Send WhatsApp notification to parent_phone (optional, async)
   h. Display success message with registration number / proof link
8. Admin navigates to /spmb/applications to review
9. Admin can download proof PDF or individual documents
```

### Proof Generation Flow
```
1. Admin clicks on application
2. System generates PDF with:
   - Application number / date
   - Student information
   - Parent information
   - Document checklist
3. Return PDF download
```

## 4.10 Key Features

### Honeypot Spam Protection
```php
$honeypot = $this->request->getPost('website');
if (is_string($honeypot) && trim($honeypot) !== '') {
    return $this->formError('Formulir tidak dapat diproses.');
}
```
- Hidden field in form (display: none via CSS)
- If populated, reject submission
- Detects basic bot submissions

### Document Management
- Upload validation (file type, size)
- Secure storage (outside web root via WRITEPATH)
- Per-application folder for organization
- Downloadable by admin
- Access control: `adminAuth` filter (super_admin only)

### Address Capture
- Full address breakdown: street, RT, RW, postal code
- Province, regency (kabupaten), district (kecamatan), village (desa)
- Support for future geocoding/address validation

## 4.11 Security & Permissions

### Filters Applied
- Public endpoints: no filter (open to all)
- Admin endpoints: `adminAuth` (super_admin only)
- Form submission: `csrf` token required

### File Security
- Upload path outside web root (WRITEPATH/uploads/spmb/)
- File type validation (not just extension check)
- Size limit (2MB per file)
- Download via controller (not direct web access)

### Sensitive Data
- NIK (16 digits) stored; consider encryption for PII
- Phone numbers (contact & parent) stored; consider encryption
- Email not verified (anyone can submit form)

## 4.12 Related Tables & Models

- `spmb_applications` - main application records
- `spmb_application_documents` - uploaded documents
- `master_ekstrakurikuler` - extracurricular options (display only)
- `school_contact_settings` - school phone, email, address for display
- `auth_users` - admin who downloads documents

## 4.13 Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| File upload fails | Validation error; re-display form with old data |
| Duplicate NIK | No duplicate check (business rule unclear); allow multiple |
| Document too large | Max size error; user can reduce file size & retry |
| Invalid email format | Validation error; user corrects & retry |
| Honeypot triggered | Generic error message (don't reveal bot detection) |
| Delete application | No delete in UI; admin can delete from DB if needed |

## 4.14 Performance Considerations

- Store uploaded files outside web root (security & performance)
- Index on `student_nik`, `student_nisn` for lookup
- Paginate applications list (DataTables)
- Lazy-load documents (don't list all files on page load)
- Consider cleanup: auto-delete old application records (retention policy)

## 4.15 Testing Scenarios

1. **Form Submission:**
   - Valid form with all documents
   - Missing required document (should fail)
   - Invalid NIK/NISN format
   - File size > 2MB
   - Invalid email/phone format
   - Honeypot field populated

2. **Admin Functions:**
   - List applications
   - Download individual document
   - Generate/download proof PDF
   - Verify file integrity after upload

3. **Edge Cases:**
   - Character encoding in address (special characters)
   - Very long names/addresses
   - Multiple submissions same NIK (allowed?)
   - Concurrent uploads (file lock handling)

## 4.16 Notes for Re-engineering

- **Email Verification:** Form doesn't verify email; consider OTP or link-based confirmation
- **NIK Validation:** No format validation beyond 16 digits; consider Indonesian NIK checksum validation
- **Duplicate Handling:** No duplicate check for NIK/NISN; business rule should clarify
- **Approval Workflow:** No approval status field; consider adding `status` (submitted, verified, approved, rejected)
- **Notification:** WhatsApp integration not detailed; consider async queue for reliability
- **Data Retention:** No policy on old applications; consider archival/cleanup strategy
- **Offline Support:** No offline mode; kiosk could capture applications & sync later (future enhancement)

