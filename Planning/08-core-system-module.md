# 8. Core System Module - Filters, Libraries, Configuration

## 8.1 Overview
Modul Core System mencakup infrastruktur dasar aplikasi: authentication filters, authorization libraries, helpers, configuration, dan middleware.

## 8.2 Filters (app/Filters/)

### `AdminAuthFilter` - Super Admin Only
**File:** `app/Filters/AdminAuthFilter.php`

```php
public function after() {
    // Check if user is logged in
    $user = session()->get('authUser');
    if (!$user) {
        return redirect()->to(site_url('login'));
    }
    
    // Check if user is super_admin
    if ((int)$user['role_id'] !== 1) { // 1 = super_admin
        return redirect()->to(site_url('auth/access-denied'));
    }
}
```

**Usage:** Routes requiring super_admin role only
```php
$routes->post('users/role/(:num)', 'UsersController::setRole/$1', 
    ['filter' => 'adminAuth']);
```

### `RoleAccessFilter` - Role-Based Access
**File:** `app/Filters/RoleAccessFilter.php`

**Parameters:** Comma-separated role names
```php
// Route filter: roleAccess:super_admin,user,kepala_sekolah
// Check: user's role is in allowed list
```

**Valid Roles:**
- super_admin
- user
- kepala_sekolah (principal)
- bendahara (finance)
- kurikulum (curriculum)
- operator (admin staff)

### `ActionAccessFilter` - Permission-Based Access
**File:** `app/Filters/ActionAccessFilter.php`

**Parameters:** Single action name
```php
// Route filter: actionAccess:student.create
// Lookup: role_action_settings where role_id, action_name = 'student.create'
// Check: can_access = 1
```

**Common Actions:**
- student.create, student.edit, student.delete, student.import
- class.create, class.edit, class.delete
- grades.save
- class-attendance.create, class-attendance.edit, class-attendance.delete, class-attendance.whatsapp
- website-news.manage, website-news.delete
- school-contact-settings.save
- academic-assessments.save
- (defined in DB: role_action_settings)

### `AuthenticatedFilter` - Any Logged-In User
**File:** `app/Filters/AuthenticatedFilter.php`

**Check:** Session has 'authUser'

**Usage:**
```php
$routes->get('profile', 'ProfileController::index', ['filter' => 'authenticated']);
```

### `ToolbarFilter` - Toolbar Visibility
**File:** `app/Filters/ToolbarFilter.php`

**Purpose:** Show/hide admin toolbar based on configuration

### `CsrfFilter` - CSRF Token Validation
**Built-in CodeIgniter filter**

**Usage:** All POST/PUT/DELETE routes
```php
$routes->post('student/create', 'StudentController::create', 
    ['filter' => ['actionAccess:student.create', 'csrf']]);
```

## 8.3 Libraries (app/Libraries/)

### `RoleAccess` - Permission Helper
**File:** `app/Libraries/RoleAccess.php`

```php
const ROLES = [
    'super_admin' => 'Super Administrator',
    'user' => 'User',
    'kepala_sekolah' => 'Principal',
    'bendahara' => 'Finance Manager',
    'kurikulum' => 'Curriculum',
    'operator' => 'Operator',
];

// Static methods:
static function can(string $action): bool
  - Check if logged-in user can perform action
  - Usage in views: @if(RoleAccess::can('student.create'))

static function role(): string
  - Get current user's role name

static function userId(): int
  - Get current user ID from session
```

**Database Lookup:**
- Query role_action_settings with user's role_id
- Match against action_name
- Return can_access flag

### `ActionAccess` - Alias for RoleAccess
**File:** `app/Libraries/ActionAccess.php`

**Same functionality as RoleAccess**
- Used interchangeably in code
- Provides semantic clarity (ActionAccess::can() vs RoleAccess::can())

### `SpmbProofPdf` - PDF Generation for SPMB
**File:** `app/Libraries/SpmbProofPdf.php`

**Purpose:** Generate proof of registration PDF for SPMB applications

**Methods:**
```php
generateProof(SpmbApplication $app): string
  - Return PDF content
  - Include: application details, document checklist, registration date
```

## 8.4 Helpers

### `Helper Functions**
**File:** `app/Helpers/` (if any custom helpers)

**Common CodeIgniter Helpers Used:**
- `site_url()` - Generate URL relative to site root
- `base_url()` - Generate URL relative to web root
- `redirect()` - Redirect response
- `session()` - Access session data
- `csrf_token()` - Generate CSRF token for forms

## 8.5 Configuration Files (app/Config/)

### `Routes.php` - URL Routing
**Total Routes:** 192 lines

**Organization:**
- Public pages (/, /news/*)
- Authentication (/auth/*, /login, /register)
- Profile management (/profile/*)
- Attendance (/attendance/*, /report/attendance/*)
- Class attendance (/class-attendance/*)
- Grades (/grades/*, /report/grades/*)
- Academic assessments (/academic-assessments/:type/*)
- Academic master data (/subjects/*, /teachers/*, /parents/*, etc.)
- Website management (/website-news/*, /website-content/*, etc.)
- Administration (/users/*, /sidebar-settings/*, /button-settings/*, /menu-settings/*)
- SPMB (/spmb/applications/*, /news/spmb/*)

**Pattern:**
```php
$routes->METHOD('path', 'Controller::method', ['filter' => 'filter1,filter2']);
```

### `Database.php` - Database Configuration
**Driver:** MySQLi (for MySQL/MariaDB)

**Configuration Variables:**
- hostname: Database server
- username: DB user
- password: DB password
- database: Database name (edusync)
- port: Database port (default 3306)

**Should be set via .env file:**
```
database.default.hostname = ${DB_HOSTNAME}
database.default.username = ${DB_USERNAME}
database.default.password = ${DB_PASSWORD}
database.default.database = ${DB_DATABASE}
```

### `Format.php` - Response Formatting
**Fixed Issue:** Added `public int $jsonEncodeDepth = 512;`

**Purpose:** Configure JSON response formatting for API responses

### `Kint.php` - Debug Tool Configuration
**Fixed Issue:** Removed `$richSort` property (CI4 4.7.5 compatibility)

**Purpose:** Configure Kint debug output (used in development)

### `App.php` - Core Application Config
**Key Settings:**
- baseURL: Site URL
- indexPage: Front controller (index.php or empty for rewrite rules)
- charset: UTF-8
- timeZone: Application timezone

### `Constants.php` - Application Constants
**Possible Custom Constants:**
- WRITEPATH: Write-able directory path
- UPLOADS_DIR: Upload directory
- MAX_UPLOAD_SIZE: File size limit

## 8.6 Filters Registration (app/Config/Filters.php)

```php
public $filters = [
    'adminAuth' => ['before' => [...], 'after' => [...]],
    'authenticated' => [...],
    'roleAccess' => [...],
    'actionAccess' => [...],
    'toolbar' => [...],
    'csrf' => [...],
];

public $aliases = [
    'adminAuth' => AdminAuthFilter::class,
    'authenticated' => AuthenticatedFilter::class,
    'roleAccess' => RoleAccessFilter::class,
    'actionAccess' => ActionAccessFilter::class,
    'toolbar' => ToolbarFilter::class,
    'csrf' => CSRF::class, // CodeIgniter built-in
];
```

## 8.7 Session Configuration (app/Config/Session.php)

**Settings:**
- sessionDriver: 'FileHandler' or 'DatabaseHandler'
- sessionCookieName: Session identifier
- sessionExpiration: Session timeout (seconds)
- sessionSavePath: Session storage path
- sessionMatchIP: Validate by IP (security)
- sessionTimeToUpdate: Refresh session timestamp (seconds)

**Best Practice:**
```php
// Store in .env:
session.driver = ${SESSION_DRIVER}
session.expiration = ${SESSION_EXPIRATION}
```

## 8.8 Security & Performance Configurations

### HTTPS/SSL
- Force HTTPS in production
- Set in .htaccess or web server config

### CORS (if API used)
- Configure allowed origins in response headers
- Set in middleware or filter

### Rate Limiting
- Not configured; consider implementing
- Protect login endpoint (brute force)

### Caching
- Cache academic years, roles, permissions
- File-based or Redis backend

### Database Connection
- Connection pooling (if supported by DB driver)
- Prepared statements (using Query Builder or parameterized queries)

## 8.9 Error Handling & Logging

### Exception Handling
**File:** `app/Config/ExceptionHandler.php`

**Logs Location:** `WRITEPATH/logs/`

**Log Format:** [YYYY-MM-DD HH:MM:SS] Level - Message

### Error Display
- Production: Generic error page (no stack trace)
- Development: Full stack trace, debug info

**Configuration:** Set via `CI_ENVIRONMENT` variable
```
CI_ENVIRONMENT=production  # or 'development'
```

## 8.10 BaseController - Common Controller Logic

**File:** `app/Controllers/BaseController.php`

**Methods:**
```php
// Commonly used helpers:

protected function getPositiveInt($value): ?int
  - Validate & return positive integer or null

protected function getSelectedId(string $param): ?int
  - Get ID from GET request with validation

protected function validateSelection(array $selected): ?string
  - Validate all selected IDs exist in DB
  - Return error message or null

protected function redirect($path, $message)
  - Convenience redirect with flash data

protected function formRedirect($id, $message)
  - Redirect to form with error message
```

## 8.11 Email Configuration (app/Config/Email.php)

**Not Fully Configured; Needed for:**
- SPMB confirmation emails
- Contact form notifications
- User password reset
- Admin alerts

**Recommended Setup:**
```php
public $protocol = 'smtp';
public $SMTPHost = ${MAIL_HOST};
public $SMTPUser = ${MAIL_USERNAME};
public $SMTPPass = ${MAIL_PASSWORD};
public $SMTPPort = 587;
public $SMTPCrypto = 'tls';
public $mailType = 'html';
public $charset = 'UTF-8';
public $newline = '\r\n';
```

## 8.12 Validation Configuration (app/Config/Validation.php)

**Custom Rules Defined:**
- Most validation done inline in controller
- Consider moving to centralized config for reuse

**Example:**
```php
public $ruleSets = [
    Rules::class,
    FileRules::class,
    CreditCardRules::class,
    CustomRules::class, // custom validation rules
];
```

## 8.13 File Upload Configuration

### Allowed MIME Types
- Documents: PDF, DOC, DOCX, XLS, XLSX
- Images: JPG, PNG, GIF
- Archives: ZIP, RAR

### Upload Paths
- Student photos: `/uploads/students/`
- SPMB documents: `/uploads/spmb/{app_id}/`
- Website content: `/uploads/website/`

**Storage:** WRITEPATH/uploads/

## 8.14 Third-Party Libraries

### Dompdf - PDF Generation
**File:** `vendor/dompdf/dompdf`

**Usage:**
```php
use Dompdf\Dompdf;
use Dompdf\Options;

$options = new Options();
$options->set('isRemoteEnabled', false);
$dompdf = new Dompdf($options);
$dompdf->loadHtml($html);
$dompdf->render();
return $dompdf->output();
```

### CodeIgniter 4 (Framework)
**Version:** 4.7.5 (production), 4.5.5 (composer.lock)
**Key Components:**
- Router (Routes.php)
- Query Builder (DB abstraction)
- Model (ORM-lite)
- Controller (MVC)
- Validation
- Session
- Security (CSRF, encryption)

### Supporting Libraries (via Composer)
- `codeigniter4/framework` - Core
- `dompdf/dompdf` - PDF generation
- `fonnte/sdk` - WhatsApp API integration (optional)
- `phpoffice/phpspreadsheet` - Excel handling (optional)

## 8.15 Performance Optimizations

### Query Optimization
- Use Query Builder (automatic parameterization)
- Add indexes on foreign keys, frequently filtered columns
- Avoid N+1 queries (use joins)
- Limit result sets (pagination)

### Caching
- Cache active academic year (static data)
- Cache role permissions (queried on every request)
- Cache homepage sections (rarely change)

### Asset Optimization
- Minify CSS/JS (use build tool like Webpack if not included)
- Compress images (already in Vuexy theme)
- CDN for static assets (optional)

### Database
- Connection pooling (if supported)
- Prepared statements (query builder uses these)
- Batch insert/update for bulk operations

## 8.16 Development Tools

### CodeIgniter CLI Commands
```bash
# Generate code
php spark make:controller StudentController
php spark make:model StudentModel
php spark make:migration CreateStudentsTable
php spark make:command ImportStudents

# Database
php spark migrate
php spark migrate:refresh
php spark seed:StudentSeeder

# Development
php spark serve
php spark list
```

### Debugging
- Kint debug tool (browser-based, in footer)
- Log files (WRITEPATH/logs/)
- Query logging (enable in Config/Database.php)

## 8.17 Testing Scenarios

1. **Filter Validation:**
   - adminAuth blocks non-super_admin users
   - roleAccess checks multiple roles correctly
   - actionAccess queries role_action_settings
   - csrf token validation

2. **Library Functions:**
   - RoleAccess::can() returns true/false correctly
   - RoleAccess::role() returns user's role
   - PDF generation produces valid PDF

3. **Configuration:**
   - Database connection works (test via php spark migrate)
   - Session storage persists (logout/login test)
   - Upload paths exist and writable

## 8.18 Deployment Checklist

- [ ] Set CI_ENVIRONMENT=production
- [ ] Configure .env with real database credentials
- [ ] Configure .env with email settings
- [ ] Set secure session storage (Redis or DB)
- [ ] Enable HTTPS/SSL
- [ ] Set up log rotation (prevent disk full)
- [ ] Configure file upload path permissions (755)
- [ ] Set base URL correctly
- [ ] Test all filters work in production
- [ ] Verify database backups scheduled
- [ ] Monitor error logs regularly

## 8.19 Notes for Re-engineering

- **Hardcoded Roles:** Role names hardcoded in filter; use DB lookup for flexibility
- **Permission Caching:** Query role_action_settings on every request; cache in session
- **Error Pages:** Customize 404, 403, 500 error pages
- **Logging:** Audit trail not implemented; add for compliance
- **Rate Limiting:** No protection against brute force
- **API Documentation:** No OpenAPI/Swagger docs
- **Load Balancing:** Session sticky required (file-based sessions)

