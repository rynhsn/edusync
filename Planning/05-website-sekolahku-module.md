# 5. Website/SekolahKu Module - Public School Website

## 5.1 Overview
Modul Website (SekolahKu) mengelola konten website publik sekolah, termasuk homepage, news, events, achievements, testimonials, FAQ, gallery, dan program informasi.

**Fitur:**
- Dynamic homepage (configurable hero, sections, statistics)
- News management (publish/draft, tags, SEO slug)
- Contact form (visitor messages)
- Contact settings (school phone, email, address)
- Program information (majors/programs)
- Content sections (achievements, testimonials, events, gallery, FAQ)
- Download center
- Public pages (custom content)

## 5.2 Database Schema

### Tables

#### `school_contact_settings` - School Contact Info
```
- setting_id (INT, PK, AI)
- phone (VARCHAR 30)
- email (VARCHAR 254)
- address (TEXT)
- hours (VARCHAR 500) - operation hours description
- created_at, updated_at (DATETIME)
```

#### `school_website_news` - News Articles
```
- news_id (INT, PK, AI)
- title (VARCHAR 200)
- slug (VARCHAR 220) - SEO-friendly URL slug
- category (VARCHAR 150)
- tags (JSON) - array of tags
- excerpt (VARCHAR 1000) - preview text
- content (LONGTEXT)
- image (VARCHAR 500) - image path/URL
- status (ENUM: 'draft', 'published')
- author (VARCHAR 100)
- published_at (DATETIME)
- created_at, updated_at (DATETIME)
- UNIQUE KEY: slug
```

#### `school_website_messages` - Contact Form Submissions
```
- message_id (INT, PK, AI)
- name (VARCHAR 150)
- email (VARCHAR 254)
- subject (VARCHAR 200)
- message (TEXT)
- is_read (TINYINT, default 0)
- read_at (DATETIME)
- created_at (DATETIME)
```

#### `schoolku_website_content` - Dynamic Homepage Content
```
- content_id (INT, PK, AI)
- section_name (VARCHAR 100) - e.g., 'hero_title', 'about', 'achievements'
- section_key (VARCHAR 100) - for programmatic access
- content (LONGTEXT)
- sort_order (INT, default 0)
- show (TINYINT, default 1) - visibility toggle
- created_at, updated_at (DATETIME)
```

#### `schoolku_website_programs` - Programs/Majors
```
- program_id (INT, PK, AI)
- program_name (VARCHAR 150)
- program_description (TEXT)
- program_icon (VARCHAR 100) - icon class (FontAwesome)
- sort_order (INT, default 0)
- show (TINYINT, default 1)
- created_at, updated_at (DATETIME)
```

#### `schoolku_website_gallery` - Gallery Images
```
- gallery_id (INT, PK, AI)
- title (VARCHAR 200)
- description (TEXT)
- image (VARCHAR 500) - image path
- sort_order (INT, default 0)
- show (TINYINT, default 1)
- created_at, updated_at (DATETIME)
```

#### `schoolku_website_achievements` - Achievements List
```
- achievement_id (INT, PK, AI)
- title (VARCHAR 200)
- description (TEXT)
- category (VARCHAR 100)
- year (YEAR)
- sort_order (INT, default 0)
- show (TINYINT, default 1)
- created_at, updated_at (DATETIME)
```

#### `schoolku_website_testimonials` - Student/Parent Testimonials
```
- testimonial_id (INT, PK, AI)
- name (VARCHAR 150)
- role (VARCHAR 100) - e.g., "Siswa", "Orang Tua"
- content (TEXT)
- image (VARCHAR 500)
- sort_order (INT, default 0)
- show (TINYINT, default 1)
- created_at, updated_at (DATETIME)
```

#### `schoolku_website_events` - Upcoming Events
```
- event_id (INT, PK, AI)
- title (VARCHAR 200)
- description (TEXT)
- start_date (DATETIME)
- end_date (DATETIME)
- location (VARCHAR 300)
- image (VARCHAR 500)
- sort_order (INT, default 0)
- show (TINYINT, default 1)
- created_at, updated_at (DATETIME)
```

#### `schoolku_website_faq` - FAQ Items
```
- faq_id (INT, PK, AI)
- question (VARCHAR 500)
- answer (LONGTEXT)
- sort_order (INT, default 0)
- show (TINYINT, default 1)
- created_at, updated_at (DATETIME)
```

#### `school_website_downloads` - Download Center Files
```
- download_id (INT, PK, AI)
- title (VARCHAR 200)
- description (TEXT)
- file_path (VARCHAR 500)
- file_size (INT)
- download_count (INT, default 0)
- created_at, updated_at (DATETIME)
```

#### `schoolku_website_pages` - Custom Pages
```
- page_id (INT, PK, AI)
- title (VARCHAR 200)
- slug (VARCHAR 220) - URL slug
- content (LONGTEXT)
- status (ENUM: 'draft', 'published')
- created_at, updated_at (DATETIME)
- UNIQUE KEY: slug
```

## 5.3 Controllers & Methods

### `SchoolkuController` - Homepage & Public Pages
**Routes:** ``, `/news/*`, `/news/pages/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `home()` | `GET /` | Public | Render homepage |
| `news()` | `GET /news/news` | Public | List all news |
| `newsDetail()` | `GET /news/news/:slug` | Public | Single news article |
| `searchNews()` | `GET /news/news/search` | Public | Search news |
| `downloads()` | `GET /news/downloads` | Public | Download center |
| `downloadFile()` | `GET /news/downloads/file/:id` | Public | Download file |
| `contact()` | `GET /news/contact` | Public | Contact form |
| `sendContactMessage()` | `POST /news/contact/send` | Public + csrf | Submit message |
| `page()` | `GET /news/pages/:slug` | Public | Custom page |
| `sitemap()` | `GET /news/sitemap.xml` | Public | XML sitemap |

**Key Logic:**
- Load homepage sections dynamically from schoolku_website_content
- Filter content by visibility (show = 1)
- Sort content by sort_order
- Paginate news list (DataTables)
- Filter news by status (published only for public)

### `SchoolkuWebsiteSettingsController` - Admin Homepage Settings
**Routes:** `website-settings/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `home()` | `GET /website-settings/home` | roleAccess | Edit hero/hero content |
| `saveHome()` | `POST /website-settings/home` | actionAccess | Save settings |
| `profile()` | `GET /website-settings/profile` | roleAccess | Edit about/principal |
| `saveProfile()` | `POST /website-settings/profile` | actionAccess | Save profile |
| `programs()` | `GET /website-settings/programs` | roleAccess | List programs |
| `saveProgramsSection()` | `POST /website-settings/programs/section` | actionAccess | Save section header |
| `saveProgram()` | `POST /website-settings/programs/save` | actionAccess | Add/update program |
| `deleteProgram()` | `POST /website-settings/programs/delete/:id` | actionAccess | Delete program |

### `SchoolWebsiteNewsController` - News Management
**Routes:** `website-news/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /website-news` | roleAccess | List news |
| `create()` | `GET /website-news/new` | actionAccess | Show form |
| `edit()` | `GET /website-news/edit/:id` | actionAccess | Show edit form |
| `save()` | `POST /website-news/save` | actionAccess + csrf | Save article |
| `delete()` | `POST /website-news/delete/:id` | actionAccess + csrf | Delete article |

**Key Logic:**
- Auto-generate slug from title (slug-format)
- Allow manual slug override
- Parse tags (comma-separated to JSON array)
- Parse published_at datetime
- Conditional: is_new ? insert : update

### `SchoolWebsiteContentController` - Content Sections
**Routes:** `website-content/:section/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index(section)` | `GET /website-content/:section` | roleAccess | List section content |
| `save(section)` | `POST /website-content/:section/save` | actionAccess | Save content |
| `delete(section, id)` | `POST /website-content/:section/delete/:id` | actionAccess | Delete content |

**Supported Sections:** achievements, testimonials, events, gallery, faq

### `SchoolContactSettingsController` - School Contact Info
**Routes:** `school-contact-settings/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /school-contact-settings` | roleAccess | Show settings form |
| `save()` | `POST /school-contact-settings` | actionAccess + csrf | Save settings |

### `SchoolWebsiteMessagesController` - Contact Messages
**Routes:** `website-messages/*`

| Method | Route | Filter | Purpose |
|--------|-------|--------|---------|
| `index()` | `GET /website-messages` | roleAccess | List messages |
| `markRead()` | `POST /website-messages/read/:id` | roleAccess + csrf | Mark as read |

## 5.4 Models

### `SchoolWebsiteNewsModel`
```php
protected $table = 'school_website_news';

// Key methods:
getLatest(int $limit = 5): array
  - Returns latest published news

getRecent(int $limit = 3): array
  - Returns 3 most recent articles

find(int $id): array|null
  - Get single article by ID
```

### `SchoolkuWebsiteContentModel`
```php
protected $table = 'schoolku_website_content';

// Key methods:
getSettings(array $defaults): array
  - Load all settings or use defaults
  - Merges DB values with provided defaults

getPrograms(bool $onlyVisible = true): array
  - Returns programs, optionally filtered by show = 1
```

### `SchoolWebsiteMessageModel`
```php
protected $table = 'school_website_messages';

// Get unread message count
```

### `MasterExtracurricularModel`
```php
public function getActiveActivities(): array
  - Used in homepage footer (services)
```

## 5.5 Routes & Access Control

```php
// Public pages
$routes->get('/', 'SchoolkuController::home');
$routes->get('news', 'SchoolkuController::home');
$routes->get('news/', 'SchoolkuController::home');
$routes->get('news/news', 'SchoolkuController::news');
$routes->get('news/news/(:segment)', 'SchoolkuController::newsDetail/$1');
$routes->get('news/downloads', 'SchoolkuController::downloads');
$routes->get('news/contact', 'SchoolkuController::contact');

// Admin management
$routes->get('website-news', 'SchoolWebsiteNewsController::index',
    ['filter' => 'roleAccess:super_admin,...']);
$routes->post('website-news/save', 'SchoolWebsiteNewsController::save',
    ['filter' => ['actionAccess:website-news.manage', 'csrf']]);

// Settings
$routes->get('school-contact-settings', 'SchoolContactSettingsController::index',
    ['filter' => 'roleAccess:super_admin,...']);
$routes->post('school-contact-settings', 'SchoolContactSettingsController::save',
    ['filter' => ['actionAccess:school-contact-settings.save', 'csrf']]);
```

## 5.6 Data Flow

### Homepage Rendering
```
1. Visitor navigates to /
2. SchoolkuController::home():
   a. Load homepage content from schoolku_website_content (with defaults)
   b. Decode JSON fields: hero_stats, counter_stats, principal, about, section_settings
   c. Load programs (visible only)
   d. Load teachers list
   e. Load extracurriculars (visible)
   f. Load achievements (visible, sorted)
   g. Load testimonials (visible, sorted)
   h. Load events (upcoming, visible)
   i. Load galleries (featured, visible)
   j. Load FAQ (visible, limited to 12)
   k. Load recent news (3 articles)
3. Render sekolahku/home view with all data
4. Frontend displays with hero section, sections, statistics, testimonials, etc.
```

### News Management Flow
```
1. Admin navigates to /website-news
2. Display paginated list (status filter: draft, published)
3. Click "New" → /website-news/new
4. Fill form: title, category, tags, excerpt, content, image, status
5. Submit POST /website-news/save
6. SchoolWebsiteNewsController::save():
   a. Validate form (title required, content required, etc.)
   b. Auto-generate slug from title (or use manual override)
   c. Parse tags: "tag1, tag2" → JSON array
   d. Handle image upload
   e. Parse published_at datetime
   f. Insert/update school_website_news
7. Redirect with success message
8. Public can view at /news/news/{slug}
```

### Content Section Management
```
1. Admin navigates to /website-content/achievements
2. Display list of achievements with sort order & visibility toggle
3. Click "Add" → form opens
4. Fill form: title, description, category, year, sort_order, show checkbox
5. Submit POST /website-content/achievements/save
6. Create/update schoolku_website_achievements record
7. Homepage automatically refreshes with new content
```

## 5.7 Key Features

### Dynamic Homepage Sections
- Hero (badge, title, subtitle, buttons, stats)
- About (principal message, school description)
- Programs (major/program list)
- Services (extracurriculars)
- Achievements (list, filtered)
- Testimonials (visible, sorted)
- Events (upcoming, sorted)
- Gallery (featured images)
- FAQ (visible, limited)
- News (recent articles)

### SEO Features
- Slug generation (title → slug-format)
- Sitemap.xml generation
- Meta tags (not fully implemented; consider adding)
- News search functionality

### Content Visibility Control
- `show` flag: toggle visibility on homepage
- `sort_order`: control display order
- Status filtering (draft vs published for news)

### Responsive Design
- Homepage uses Vuexy theme
- Bootstrap responsive grid
- Card-based layouts

## 5.8 Database Relationships

```
school_website_news
└── (standalone; no FK)

schoolku_website_content
└── (standalone; section-based organization)

schoolku_website_programs
└── (standalone)

school_website_messages
└── (standalone; contact form submissions)

master_ekstrakurikuler
└── (linked via homepage display only; no FK)
```

## 5.9 Security & Permissions

### Filters
- Public endpoints: no filter (open to all)
- Admin edit: `roleAccess:super_admin,...`
- Form submission: `csrf` token required
- Delete operations: `actionAccess:website-content.delete`, etc.

### XSS Prevention
- Content sanitization in views (CodeIgniter escape helpers)
- Rich text editor (if used) should sanitize HTML

## 5.10 Performance Considerations

- Cache homepage content (rarely changes)
- Lazy-load images (modern browser support)
- Paginate news list (DataTables)
- Index on `slug` (news, pages)
- Index on `status` (news visibility filtering)

## 5.11 Testing Scenarios

1. **Homepage:**
   - Load with all sections visible
   - Load with sections hidden (show = 0)
   - Sort order respected
   - Upcoming events displayed (start_date > now)
   - Testimonials display correctly

2. **News Management:**
   - Create news with auto-slug
   - Create news with manual slug
   - Publish/draft toggle
   - Search functionality
   - Tag filtering

3. **Contact Form:**
   - Submit message
   - Message stored in database
   - Mark as read

4. **Admin Settings:**
   - Update school contact info
   - Update homepage hero content
   - Update programs list
   - Verify changes reflected on public homepage

## 5.12 Notes for Re-engineering

- **SEO:** Meta title/description not fully implemented; add for news & pages
- **Image Management:** No built-in image editor/crop; consider adding
- **Rich Text Editor:** Consider TinyMCE or similar for content editing
- **Cache:** Homepage should be cached (Redis or file-based)
- **CDN:** Images should be served from CDN for performance
- **Multi-language:** Currently Indonesia only; consider i18n for expansion
- **Analytics:** No tracking; consider Google Analytics integration
- **Email Notifications:** Contact form doesn't notify admin; consider email/webhook

