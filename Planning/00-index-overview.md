# EduSync Technical Documentation - Complete Re-engineering Reference

## Overview

EduSync adalah sistem manajemen sekolah berbasis web yang mengintegrasikan absensi RFID, manajemen nilai, penilaian siswa, dan website sekolah publik. Dibangun dengan CodeIgniter 4, MySQL/MariaDB, dan tema Vuexy admin.

**Dokumentasi ini dirancang untuk:**
- Pemahaman menyeluruh arsitektur sistem
- Panduan re-engineering fitur per modul
- Detail teknis: database, API routes, validasi
- Panduan testing dan deployment

## Table of Contents

1. [**01. Attendance Module**](01-attendance-module.md) - RFID Kiosk & Class Attendance
   - RFID attendance tracking
   - Class attendance management
   - WhatsApp notifications
   - Reports & PDF export

2. [**02. Grades & Academic Module**](02-grades-academic-module.md) - Academic Grading System
   - Student grade input (UTS, UAS, Knowledge, Practice)
   - Master data: subjects, teachers, academic years
   - Grade reporting & analytics
   - Teacher-subject assignment

3. [**03. Assessments Module**](03-assessments-module.md) - Non-Academic Evaluation
   - Personality assessment (hardcoded aspects)
   - Extracurricular grading
   - Co-curricular (kokurikuler) assessment
   - Grade scale: A, B, C, D

4. [**04. SPMB Module**](04-spmb-module.md) - Online Student Registration
   - New student registration form (public)
   - Document upload (5 required docs, max 2MB)
   - Admin proof generation & review
   - Honeypot spam protection

5. [**05. Website/SekolahKu Module**](05-website-sekolahku-module.md) - Public School Website
   - Dynamic homepage with configurable sections
   - News management (publish/draft)
   - Contact form & messaging
   - Programs, achievements, testimonials, events
   - FAQ, gallery, downloads

6. [**06. Administration Module**](06-administration-module.md) - System Management
   - User management & role assignment
   - Role-based access control (6 roles)
   - Sidebar customization per role
   - Button settings (enable/disable)
   - Custom menu management

7. [**07. Master Data Module**](07-master-data-module.md) - Reference Data
   - Student management (CRUD, soft delete, import/export)
   - Class configuration
   - Teacher & parent management
   - Lesson period settings
   - Program/major configuration
   - Attendance status customization

8. [**08. Core System Module**](08-core-system-module.md) - Infrastructure
   - Authentication & authorization filters
   - Role access library
   - Configuration files
   - Error handling & logging
   - Third-party integrations

## System Architecture

### Technology Stack
```
Backend:     CodeIgniter 4 (PHP 8.1+)
Database:    MySQL 5.7+ / MariaDB 10.3+
Frontend:    Bootstrap + jQuery + DataTables
Theming:     Vuexy admin template (Vuexy/Bootstrap Icons)
PDF:         Dompdf
Messaging:   Fonnte API (WhatsApp)
Excel:       PhpSpreadsheet (optional)
```

### Directory Structure
```
edusync-attendance/
├── app/
│   ├── Controllers/        # 28 controllers for all modules
│   ├── Models/             # 16 models for data access
│   ├── Views/              # View templates (Blade/PHP)
│   ├── Config/             # Routes, Database, Session, etc.
│   ├── Filters/            # Auth, role access, CSRF
│   ├── Libraries/          # RoleAccess, ActionAccess, SpmbProofPdf
│   ├── Helpers/            # Helper functions
│   ├── Database/
│   │   ├── Migrations/     # 30+ database migrations
│   │   └── Seeders/        # Data seeders
│   └── Language/           # i18n (Indonesian)
├── public/
│   ├── assets/
│   │   └── vendors/        # Pre-built Vuexy theme
│   ├── index.php           # Front controller
│   └── .htaccess           # URL rewriting
├── docs/
│   ├── modules/            # This documentation
│   ├── whatsapp-attendance-setup.md
│   └── *.sql               # SQL setup files
├── writable/
│   ├── uploads/            # File uploads (students, SPMB, etc.)
│   ├── cache/              # Application cache
│   └── logs/               # Error & application logs
├── .env                    # Environment configuration
├── composer.json           # PHP dependencies
├── composer.lock           # Locked versions
└── README.md               # Project overview
```

## Database Schema Overview

### 37 Tables Total

#### Authentication & Authorization
- `auth_users` - System users with roles
- `auth_roles` - Role definitions (6 roles: super_admin, user, kepala_sekolah, bendahara, kurikulum, operator)
- `role_action_settings` - Permission matrix
- `role_sidebar_settings` - Sidebar per role
- `button_settings` - Button toggles

#### Attendance
- `absensi_absensi_sekolah` - RFID attendance log
- `absensi_absensi_kelas` - Class attendance session
- `absensi_absensi_kelas_siswa` - Student attendance per class
- `absensi_status_kehadiran` - Attendance presence types
- `absensi_status_absensi` - Entry/exit status types
- `attendance_status_logs` - Status change history (optional)

#### Academic
- `academic_student_grades` - Student grades (UTS, UAS, Knowledge, Practice)
- `academic_student_personality` - Personality assessment
- `academic_student_extracurricular` - Extracurricular grading
- `academic_student_kokurikuler` - Co-curricular grading
- `master_mapel` - Subjects
- `master_guru` - Teachers
- `master_tahun_ajaran` - Academic years
- `master_jam_pelajaran` - Lesson periods
- `teacher_mapel` - Teacher-subject assignments

#### Master Data
- `master_siswa` - Students (soft delete)
- `master_kelas` - Classes
- `master_orang_tua` - Parents/guardians
- `master_program` / `master_jurusan` - Programs/majors
- `master_ekstrakurikuler` - Extracurricular activities
- `master_kokurikuler` - Co-curricular activities

#### SPMB (Student Registration)
- `spmb_applications` - Registration applications
- `spmb_application_documents` - Uploaded documents

#### Website/SekolahKu
- `school_website_news` - News articles
- `school_website_messages` - Contact form submissions
- `school_contact_settings` - School info (phone, email, address)
- `schoolku_website_content` - Dynamic content sections
- `schoolku_website_programs` - Program listings
- `schoolku_website_achievements` - Achievements
- `schoolku_website_testimonials` - Student/parent testimonials
- `schoolku_website_events` - Upcoming events
- `schoolku_website_gallery` - Gallery images
- `schoolku_website_faq` - FAQ items
- `school_website_downloads` - Downloadable files
- `schoolku_website_pages` - Custom pages
- `custom_sidebar_menus` - Admin sidebar customization
- `sidebar_menu_icon_overrides` - Icon customization per role

## Access Control

### 6 Built-in Roles

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| `super_admin` | Full system access | All features |
| `user` | Standard staff | Most features, no settings |
| `kepala_sekolah` | Principal | View reports, approve decisions |
| `bendahara` | Finance manager | View academic data, reports |
| `kurikulum` | Curriculum coordinator | Input grades, manage academic data |
| `operator` | Admin support | CRUD master data, attendance |

### Filter Types

1. **No Filter:** Public endpoints (/, /news/*, SPMB form, RFID kiosk)
2. **roleAccess:** List of allowed roles
3. **actionAccess:** Specific permission (checked in DB)
4. **adminAuth:** super_admin only
5. **authenticated:** Any logged-in user
6. **csrf:** CSRF token validation

## Key Workflows

### User Registration & Login
```
Register → OTP Verification → Login → Session Created → Access Control via Filters
```

### Student Attendance (RFID)
```
Tap Card → Find Student → Check Schedule → Log Attendance → Calculate Status → Update DB
```

### Class Attendance
```
Teacher Create Session → Select Class/Subject/Date → Batch Mark Attendance → WhatsApp Notify → PDF Report
```

### Grade Input
```
Teacher Select Class/Subject/Year → Load Students → Input Grades (0-100) → Validate → Save to DB
```

### New Student Registration (SPMB)
```
Fill Form → Upload 5 Documents → Validate → Store → Admin Review → Download Proof
```

## API Routes Summary

### Public Routes (No Auth)
- `GET /` - Homepage
- `GET /news/*` - News & downloads
- `GET /news/spmb` - SPMB form
- `POST /news/spmb/submit` - SPMB submission
- `GET /attendance` - RFID kiosk
- `POST /attendance/tap` - RFID event
- `GET /login`, `GET /register` - Auth forms
- `POST /auth/*` - Auth operations

### Authenticated Routes
- `GET /profile` - User profile
- `POST /profile` - Update profile
- `GET /panel` - Dashboard

### Managed Routes (roleAccess filter)
- `GET /attendance/manage` - Attendance management
- `GET /student`, `POST /student/*` - Student CRUD
- `GET /class`, `POST /class/*` - Class CRUD
- `GET /grades`, `POST /grades` - Grade input
- `GET /class-attendance/*` - Class attendance
- `GET /report/*` - Reports & exports

### Admin Routes (adminAuth filter)
- `GET /users`, `POST /users/role/:id` - User management
- `GET /sidebar-settings`, `POST /sidebar-settings` - Sidebar config
- `GET /button-settings`, `POST /button-settings` - Button config
- `GET /menu-settings`, `POST /menu-settings` - Menu config
- `GET /spmb/applications` - SPMB review

## Important Technical Details

### Soft Delete Pattern
- StudentModel uses `$useSoftDeletes = true`
- Deleted records stay in DB (deleted_at timestamp)
- Queries automatically exclude soft-deleted rows
- No permanent delete via UI

### Unique Constraints
- Email, username (auth_users)
- NIS, NISN, RFID tag (master_siswa)
- Mapel code, guru NIP (master_mapel, master_guru)
- Slug (school_website_news, schoolku_website_pages)
- Academic year (master_tahun_ajaran)
- Class attendance session (kelas, mapel, periode, tahun, tanggal)

### File Uploads
- Path: WRITEPATH/uploads/ (outside web root)
- SPMB: organized by application_id
- Max size: 2MB per file
- Allowed types: PDF, JPG, PNG (validated server-side)

### WhatsApp Integration
- Provider: Fonnte API
- Trigger: After class attendance creation
- Message: Student name, class, date, status, notes
- Recipients: Parent phone from master_orang_tua
- Setup: `docs/whatsapp-attendance-setup.md`

### Excel Import/Export
- Student import: Template with validation
- Export: All students to Excel
- Format: CSV-like spreadsheet
- Encoding: UTF-8

### PDF Generation
- Library: Dompdf
- Pages: Attendance reports, class attendance, grades, SPMB proof
- Format: A4, landscape (some reports)
- HTML-based templates

## Configuration Management

### Environment File (.env)
```
CI_ENVIRONMENT=production
app.baseURL=https://edusync.school/

database.default.hostname=localhost
database.default.username=edusync_user
database.default.password=secure_password
database.default.database=edusync

session.driver=FileHandler
session.expiration=3600

mail.host=smtp.gmail.com
mail.username=noreply@school.com
mail.password=app_password
```

### Database Configuration
- Database name: `edusync`
- Charset: utf8mb4
- Collation: utf8mb4_unicode_ci

## Performance Optimization Strategies

1. **Caching:** Academic years, role permissions, homepage sections
2. **Indexing:** Foreign keys, frequently filtered columns (status, tanggal)
3. **Pagination:** Lists limited to 25-50 items per page (DataTables)
4. **Query Optimization:** Use joins instead of N+1 queries
5. **Asset Optimization:** CSS/JS minification, image compression
6. **Database:** Batch insert/update for bulk operations

## Deployment Notes

### Requirements
- PHP 8.1+
- MySQL 5.7+ or MariaDB 10.3+
- Web server: Apache (with mod_rewrite) or Nginx
- SSL certificate (HTTPS recommended)
- Composer 2.0+

### Setup Steps
1. Clone repository
2. Run `composer install`
3. Copy `.env.example` to `.env`
4. Configure database & mail settings
5. Run migrations: `php spark migrate`
6. (Optional) Run seeders: `php spark seed:InitialSeeder`
7. Set correct file permissions (uploads/ writable)
8. Point web server to `public/` directory

### Post-Deployment
- Monitor error logs (WRITEPATH/logs/)
- Set up automated backups (database + uploads)
- Configure log rotation (prevent disk full)
- Enable HTTPS/SSL
- Set CI_ENVIRONMENT=production
- Test all filters & permissions

## Testing Checklist

- [ ] Authentication (register, login, logout)
- [ ] Role-based access (filters work)
- [ ] Student CRUD (create, read, update, soft delete)
- [ ] Grade input & validation
- [ ] RFID attendance (single & double tap)
- [ ] Class attendance & WhatsApp notification
- [ ] SPMB form submission & document upload
- [ ] Website homepage & news
- [ ] Admin settings (sidebar, buttons, menu)
- [ ] PDF export (attendance, grades, SPMB)
- [ ] Excel import (students)
- [ ] Mobile responsiveness (Vuexy theme)

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Database migration fails | Check DB credentials, run `php spark migrate --group attendance` for specific group |
| Upload fails (permission denied) | Ensure WRITEPATH/uploads/ exists and is writable (755) |
| WhatsApp not sending | Verify Fonnte API key, check logs for error |
| Session timeout too quick | Increase session.expiration in .env |
| Slow grade loading | Add index on academic_student_grades(siswa_id, mapel_id) |
| PDF generation fails | Enable allow_url_fopen in php.ini or set isRemoteEnabled=false in Dompdf options |

## Re-engineering Priorities

### High Priority (Core Functionality)
1. Attendance system (RFID + class)
2. Authentication & role-based access
3. Grade input & reporting
4. Student master data

### Medium Priority (Enhanced Features)
1. Website content management
2. Assessments (personality, extracurricular)
3. SPMB registration
4. WhatsApp notifications

### Low Priority (Polish/Optimization)
1. Dashboard analytics
2. Advanced reporting
3. Mobile app integration
4. Performance optimization

## Future Enhancements

- [ ] Two-factor authentication (TOTP/SMS)
- [ ] Email notifications (password reset, announcements)
- [ ] Dashboard with KPI charts
- [ ] Advanced filtering & search
- [ ] Audit trail for compliance
- [ ] Multi-language support (i18n)
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Mobile app (native or hybrid)
- [ ] Video upload support (events, lessons)
- [ ] Calendar integration (events, schedules)

---

## Document Maintenance

**Last Updated:** 2026-10-16
**Version:** 1.0 (Complete System Documentation)
**Framework Version:** CodeIgniter 4.7.5
**Database:** MySQL 5.7+
**PHP:** 8.1+

**Contributors:** System Engineering Documentation
**Status:** Ready for Re-engineering Development

For questions or updates, refer to the specific module documentation or source code.

