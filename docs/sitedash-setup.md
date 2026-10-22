# SiteDash v2.0 — Installation & Integration Guide

> SiteDash is a modular, plug-and-play admin dashboard and CMS engine built for Next.js projects (Tailwind CSS, TypeScript, Neon/PostgreSQL).

## 🚀 Quick Integration

1. **Copy Module Files**:
   Copy `/src/lib/sitedash` and `/src/app/[lang]/admin` into your Next.js project directory.

2. **Database Setup (Neon / PostgreSQL)**:
   Add your Neon connection strings to `.env.local`:
   ```env
   DATABASE_URI=postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/neondb?sslmode=require
   DATABASE_URI_DIRECT=postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/neondb?sslmode=require
   ```

3. **Access the Dashboard**:
   Start your development server and navigate to:
   `http://localhost:3000/ar/admin` or `http://localhost:3000/en/admin`

## ✨ Features Included
- **Plug-and-Play Architecture**: Zero friction installation as an internal module.
- **Bilingual Support**: Instant Arabic/English RTL/LTR switching.
- **Live WYSIWYG Preview**: Real-time visual feedback for content editors.
- **Feature Flags**: Instant enable/disable toggles for pages and sections without redeploying.
- **SEO & GTM Manager**: Meta tags, descriptions, and script injection.
- **Google Sheets Sync**: Built-in Google Apps Script generator for real-time lead tracking.
- **Visual n8n-Style RBAC Tree**: Interactive role management and approval workflows.
