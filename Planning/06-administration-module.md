# 6. Administration Module - System Management & Settings

## 6.1 Overview
Modul Administration mengelola konfigurasi sistem, pengguna, peran, izin akses, sidebar, tombol, dan menu.

**Fitur:**
- User management (create, role assignment, password reset)
- Role-based access control (RBAC) - 6 roles built-in
- Sidebar customization (link management, icon overrides)
- Button settings (enable/disable action buttons)
- Menu settings (custom menu links)
- Attendance status configuration
- Time settings (untuk kiosk absensi)

## 6.2 Database Schema

### Tables

#### `auth_users` - System Users
```
- user_id (INT, PK, AI)
- email (VARCHAR 254, UNIQUE)
- username (VARCHAR 32, UNIQUE)
- password (VARCHAR 255) - bcrypt hash
- display_name (VARCHAR 100)
- is_verified (TINYINT, default 0)
- is_active (TINYINT, default 1)
- avatar (VARCHAR 500) - profile photo path
- verification_token (VARCHAR 255) - for email verification
- role_id (INT, FK → auth_roles)
- last_login (DATETIME)
- created_at, updated_at (DATETIME)
```

#### `auth_roles` - Role Definitions
```
- role_id (INT, PK)
- role_name (VARCHAR 100, UNIQUE)
- role_description (TEXT)
- created_at, updated_at (DATETIME)

Pre-populated:
- 1 = super_admin (full access)
- 2 = user (standard staff)
- 3 = kepala_sekolah (principal)
- 4 = bendahara (finance)
- 5 = kurikulum (curriculum)
- 6 = operator (admin staff)
```

#### `role_action_settings` - Action Permissions
```
- setting_id (INT, PK, AI)
- role_id (INT, FK → auth_roles)
- action_name (VARCHAR 100) - e.g., "student.create", "grades.save"
- can_access (TINYINT, default 1)
- created_at, updated_at (DATETIME)
```

#### `role_sidebar_settings` - Sidebar Per-Role
```
- sidebar_setting_id (INT, PK, AI)
- role_id (INT, FK → auth_roles)
- menu_item_key (VARCHAR 100) - e.g., "attendance", "grades", "spmb"
- is_visible (TINYINT, default 1)
- sort_order (INT, default 0)
- created_at, updated_at (DATETIME)
```

#### `button_settings` - Action Button Toggles
```
- button_id (INT, PK, AI)
- button_key (VARCHAR 100, UNIQUE) - e.g., "create_student", "delete_user"
- label (VARCHAR 100)
- is_enabled (TINYINT, default 1)
- description (TEXT)
- created_at, updated_at (DATETIME)
```

#### `custom_sidebar_menus` - Custom Menu Links
```
- menu_id (INT, PK, AI)
- parent_menu_id (INT, FK → self, nullable) - for nested menus
- menu_name (VARCHAR 100)
- menu_url (VARCHAR 255)
- menu_icon (VARCHAR 100) - icon class (FontAwesome/Bootstrap Icons)
- sort_order (INT, default 0)
- is_visible (TINYINT, default 1)
- created_at, updated_at (DATETIME)
```

#### `sidebar_menu_icon_overrides` - Per-Role Icon Customization
```
- override_id (INT, PK, AI)
- role_id (INT, FK → auth_roles)
- menu_item_key (VARCHAR 100)
- icon_class (VARCHAR 100) - custom icon
- created_at, updated_at (DATETIME)
```

#### `master_jam_pelajaran` - Time Settings
```
- jam_pelajaran_id (INT, PK, AI)
- jam_ke (SMALLINT, UNIQUE) - period order
- jam_nama (VARCHAR 50)
- jam_mulai (TIME)
- jam_selesai (TIME)
- created_at, updated_at (DATETIME)
```

#### `absensi_status_absensi` - Attendance Status
```
- status_absensi_id (INT, PK)
- status_absensi (VARCHAR 50) - e.g., "Tepat Waktu", "Terlambat"
- status_absensi_warna (VARCHAR 7) - hex color code
- created_at, updated_at (DATETIME)
```

#### `absensi_status_kehadiran` - Attendance Presence Status
```
- status_kehadiran_id (INT, PK)
- status_kehadiran (VARCHAR 50) - e.g., "Hadir", "Sakit"
- status_kehadiran_warna (VARCHAR 7) - hex color code
- created_at, updated_at (DATETIME)
```

## 6.3 Controllers & Methods

### `UsersController` - User Management
**Routes:** `users/*`, `user-passwords/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /users` | roleAccess | List all users |
| `setRole()` | `POST /users/role/:id` | adminAuth + csrf | Assign role |
| `passwords()` | `GET /user-passwords` | adminAuth | Password reset page |
| `resetPassword()` | `POST /user-passwords/reset/:id` | adminAuth + csrf | Reset user password |

**Key Logic:**
- List users with current role
- Admin can change user role
- Admin can reset user password (generates temporary password)

### `SidebarSettingsController` - Sidebar Configuration
**Routes:** `sidebar-settings/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /sidebar-settings` | adminAuth | Show configuration form |
| `save()` | `POST /sidebar-settings` | adminAuth + csrf | Save settings |

**Key Logic:**
- Configure which menu items visible for each role
- Set sort order per menu item
- Load from role_sidebar_settings table

### `ButtonSettingsController` - Button Toggles
**Routes:** `button-settings/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /button-settings` | adminAuth | Show button toggles |
| `save()` | `POST /button-settings` | adminAuth + csrf | Save toggles |

**Key Logic:**
- Enable/disable action buttons globally
- Example: disable "delete student" button
- Settings stored in button_settings table

### `MenuSettingsController` - Custom Menus
**Routes:** `menu-settings/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /menu-settings` | adminAuth | List custom menus |
| `save()` | `POST /menu-settings/save` | adminAuth + csrf | Create/update menu |
| `saveIcon()` | `POST /menu-settings/icon` | adminAuth + csrf | Override menu icon |
| `delete()` | `POST /menu-settings/delete/:id` | adminAuth + csrf | Delete menu |

**Key Logic:**
- Create custom sidebar menu items
- Support nested menus (parent_menu_id)
- Override icon per role
- Drag-to-sort via frontend

## 6.4 Models

### `AuthUserModel`
```php
protected $table = 'auth_users';

// Key methods:
getByEmail(string $email): array|null
getByUsername(string $username): array|null
getAllUsers(): array
```

### `RoleModel`
```php
protected $table = 'auth_roles';
// Standard CRUD
```

### Role names (from app/Libraries/RoleAccess.php)
```php
const ROLES = [
    'super_admin' => 'Super Administrator',
    'user' => 'User',
    'kepala_sekolah' => 'Principal',
    'bendahara' => 'Finance',
    'kurikulum' => 'Curriculum',
    'operator' => 'Operator',
];
```

## 6.5 Authentication Flow

### User Registration (AuthController)
```
1. Visitor navigates to /register
2. Fill form: email, display_name, username, password
3. Validation:
   - Email: valid format, not already verified
   - Username: 3-32 chars, alphanumeric + ._-
   - Password: 8-72 chars
4. Submit POST /auth/register
5. AuthController::registerAccount():
   a. Check email not already verified (allow re-registration if unverified)
   b. Check username unique (across new & old registrations)
   c. Generate OTP code
   d. Store in session: otpEmail, otpCode
   e. Redirect to /auth/verify
6. Verification page displays email, OTP input field
7. User submits OTP (POST /auth/verify-code)
8. AuthController::verifyCode():
   a. Check OTP matches
   b. Update auth_users.is_verified = 1
   c. Clear session
   d. Redirect to login
```

### User Login
```
1. Navigate to /login
2. Email + password form
3. POST /auth/authenticate
4. AuthController::authenticate():
   a. Find user by email
   b. Verify password (bcrypt)
   c. Check is_verified = 1
   d. Store in session: authUser (user_id, email, role_id, display_name)
   e. Update last_login timestamp
   f. Redirect to /panel or stored destination
```

## 6.6 Authorization: Role-Based Access Control

### Filter: `roleAccess`
```php
// Routes: $routes->get(..., ['filter' => 'roleAccess:super_admin,user,kepala_sekolah,...'])
// Checks: user's role is in allowed list
// On deny: redirect to /auth/access-denied
```

### Filter: `actionAccess`
```php
// Routes: $routes->post(..., ['filter' => 'actionAccess:student.create'])
// Checks: user's role has permission for action
// Lookup: role_action_settings where role_id = user.role_id, action_name = 'student.create'
// On deny: redirect to /auth/access-denied
```

### Library: RoleAccess (app/Libraries/RoleAccess.php)
```php
static function can(string $action): bool
  - Check if logged-in user can perform action
  - Usage in views: @if(ActionAccess::can('student.create'))

static function role(): string
  - Get logged-in user's role
```

## 6.7 Validation Rules

### User Registration
```php
'email' => 'required|valid_email|max_length[254]',
'display_name' => 'required|max_length[100]',
'username' => 'required|regex_match[/^[a-z0-9._-]{3,32}$/]',
'password' => 'required|min_length[8]|max_length[72]',
```

### OTP Verification
```php
'otp_code' => 'required|numeric|exact_length[6]',
```

## 6.8 Routes & Access Control

```php
// Authentication (public)
$routes->get('login', 'AuthController::login');
$routes->get('register', 'AuthController::register');
$routes->post('auth/register', 'AuthController::registerAccount', ['filter' => 'csrf']);
$routes->post('auth/authenticate', 'AuthController::authenticate', ['filter' => 'csrf']);
$routes->post('auth/logout', 'AuthController::logout', ['filter' => 'csrf']);

// User Management (admin)
$routes->get('users', 'UsersController::index', ['filter' => 'roleAccess:super_admin,...']);
$routes->post('users/role/(:num)', 'UsersController::setRole/$1', ['filter' => ['adminAuth', 'csrf']]);

// Settings (admin)
$routes->get('sidebar-settings', 'SidebarSettingsController::index', ['filter' => 'adminAuth']);
$routes->post('sidebar-settings', 'SidebarSettingsController::save', ['filter' => ['adminAuth', 'csrf']]);
$routes->get('button-settings', 'ButtonSettingsController::index', ['filter' => 'adminAuth']);
$routes->post('button-settings', 'ButtonSettingsController::save', ['filter' => ['adminAuth', 'csrf']]);
$routes->get('menu-settings', 'MenuSettingsController::index', ['filter' => 'adminAuth']);
$routes->post('menu-settings/save', 'MenuSettingsController::save', ['filter' => ['adminAuth', 'csrf']]);
```

## 6.9 Security & Permissions

### Filters
- `adminAuth` - super_admin role only (defined in app/Filters/AdminAuthFilter.php)
- `roleAccess` - allow multiple roles
- `actionAccess` - permission-based (stored in DB)
- `authenticated` - any logged-in user
- `csrf` - CSRF token validation

### Password Security
- Hashed with bcrypt (CodeIgniter default)
- Min 8 chars, max 72 chars (bcrypt limit)
- Temporary password on reset (user must change at first login, not implemented)

### Session Security
- Session stored (file-based or DB configurable)
- Last login tracked
- is_verified flag ensures email confirmed before access

## 6.10 Data Flow

### Sidebar Rendering (per user role)
```
1. User logs in, role_id stored in session
2. On page load, BaseController loads sidebar:
   a. Query role_sidebar_settings where role_id = user.role_id
   b. Get menu items with is_visible = 1
   c. Sort by sort_order
   d. Load icon overrides from sidebar_menu_icon_overrides
   e. Pass to view
3. Render sidebar with user's permitted menu items
```

### Button Visibility (global toggle)
```
1. Admin navigates to /button-settings
2. Display all buttons with toggle checkbox
3. Admin toggles buttons (e.g., disable "delete" action)
4. POST /button-settings
5. Update button_settings.is_enabled = 0/1
6. Frontend checks: ActionAccess::can('button_key') before showing button
```

## 6.11 Related Tables

```
auth_users
├── role_id → auth_roles
└── (no other direct FK; role permissions via role_action_settings)

role_action_settings
├── role_id → auth_roles
└── (action_name is free-text; no FK to action table)

role_sidebar_settings
├── role_id → auth_roles
└── (menu_item_key is free-text; no FK)

sidebar_menu_icon_overrides
├── role_id → auth_roles
└── (menu_item_key is free-text)

custom_sidebar_menus
└── parent_menu_id → self (for nesting)
```

## 6.12 Performance Considerations

- Cache role permissions (rarely change)
- Cache sidebar per role (rarely change)
- Index on (role_id, action_name) in role_action_settings
- Index on (email, username) in auth_users for login lookup
- Paginate users list if 1000+ users

## 6.13 Testing Scenarios

1. **User Registration & Login:**
   - Valid registration, email verification
   - Duplicate email/username
   - Invalid password format
   - Login with unverified email (should fail)

2. **Role Assignment:**
   - Assign role to user
   - Verify user's sidebar/permissions change
   - Downgrade admin to operator

3. **Permission Checks:**
   - User with role can access permitted routes
   - User without role gets access-denied
   - Action-based permissions work correctly

4. **Settings:**
   - Toggle sidebar items per role
   - Enable/disable action buttons
   - Create custom menu items
   - Icon override per role

## 6.14 Notes for Re-engineering

- **Two-factor Auth:** Not implemented; consider TOTP/SMS for higher security
- **Password Reset Email:** System doesn't email temporary password; UI-only reset
- **Audit Log:** No tracking of who changed what; consider adding audit trail
- **Session Timeout:** Not configured; consider auto-logout after inactivity
- **Rate Limiting:** No login attempt limits; vulnerable to brute force
- **Permission Caching:** Checked on every request; cache in session for performance
- **Custom Actions:** action_name is free-text; no validation against known actions

