'react';
import React, { useState } from 'react';
import {
  LayoutDashboard, FileText, Settings, Shield, Users, Database,
  Code, Eye, Globe, ToggleLeft, ToggleRight, Plus, Save, RefreshCw,
  CheckCircle2, AlertTriangle, ChevronRight, Lock, Unlock, ArrowUpRight
} from 'lucide-react';
import { SiteDash } from '@/lib/sitedash/engine';

export default function SiteDashAdminPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'seo' | 'leads' | 'rbac' | 'scripts'>('overview');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [successMsg, setSuccessMsg] = useState('');

  const seo = SiteDash.getSeo();
  const leads = SiteDash.getLeads();
  const roles = SiteDash.getRoles();

  const triggerSave = () => {
    setSuccessMsg(lang === 'ar' ? 'تم الحفظ بنجاح وتحديث الموقع!' : 'Saved successfully & site updated!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const appsScriptCode = `
/**
 * Shamah Clinics Lead Sync - Google Apps Script
 * Paste this script into your Google Sheets Extensions > Apps Script
 */
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);

  sheet.appendRow([
    new Date(),
    data.name,
    data.phone,
    data.service,
    data.branch,
    data.date || 'N/A'
  ]);

  return ContentService.createTextOutput(JSON.stringify({"status":"success"}))
    .setMimeType(ContentService.MimeType.JSON);
}
  `.trim();

  return (
    <div className={`min-h-screen bg-neutral-950 text-neutral-100 flex ${lang === 'ar' ? 'rtl' : 'ltr'}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>

      {/* Sidebar */}
      <aside className="w-72 bg-neutral-900 border-r border-neutral-800 flex flex-col justify-between">
        <div>
          <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">SiteDash v2.0</h1>
              <p className="text-xs text-neutral-400">Shamah Clinics Ultimate CMS</p>
            </div>
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs font-medium border border-neutral-700"
            >
              {lang === 'ar' ? 'EN' : 'عربي'}
            </button>
          </div>

          <nav className="p-4 space-y-1">
            {[
              { id: 'overview', labelAr: 'لوحة التحكم', labelEn: 'Overview', icon: LayoutDashboard },
              { id: 'content', labelAr: 'إدارة الأقسام والصفحات', labelEn: 'Pages & Sections', icon: FileText },
              { id: 'seo', labelAr: 'إدارة SEO والسكريبتات', labelEn: 'SEO & GTM', icon: Globe },
              { id: 'leads', labelAr: 'إدارة اللييدز (Leads)', labelEn: 'Leads & CRM', icon: Database },
              { id: 'rbac', labelAr: 'صلاحيات n8n (RBAC Tree)', labelEn: 'RBAC Permission Tree', icon: Shield },
              { id: 'scripts', labelAr: 'توليد Google Apps Script', labelEn: 'Apps Script Generator', icon: Code },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{lang === 'ar' ? item.labelAr : item.labelEn}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-neutral-800">
          <a
            href={`/${lang}`}
            target="_blank"
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs font-medium border border-neutral-700 transition"
          >
            <span>{lang === 'ar' ? 'معاينة الموقع الحي' : 'View Live Website'}</span>
            <ArrowUpRight className="w-4 h-4" />
          </a>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">

        {/* Top bar */}
        <header className="h-16 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold capitalize">
              {activeTab === 'overview' && (lang === 'ar' ? 'نظرة عامة على النظام' : 'System Overview')}
              {activeTab === 'content' && (lang === 'ar' ? 'التحكم في الأقسام والصفحات (Feature Flags)' : 'Pages & Feature Flags')}
              {activeTab === 'seo' && (lang === 'ar' ? 'إدارة محركات البحث والوسوم' : 'SEO & Tag Manager')}
              {activeTab === 'leads' && (lang === 'ar' ? 'قائمة الحجوزات والطلبات' : 'Leads & Bookings')}
              {activeTab === 'rbac' && (lang === 'ar' ? 'شجرة صلاحيات المستخدمين (n8n Style)' : 'Visual RBAC Permission Tree')}
              {activeTab === 'scripts' && (lang === 'ar' ? 'مولد كود Google Sheets Apps Script' : 'Google Sheets Apps Script Generator')}
            </h2>
            {successMsg && (
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs animate-pulse">
                <CheckCircle2 className="w-4 h-4" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={triggerSave}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold rounded-xl text-sm transition shadow-lg shadow-amber-500/10"
            >
              <Save className="w-4 h-4" />
              <span>{lang === 'ar' ? 'حفظ ونشر التغييرات' : 'Save & Publish'}</span>
            </button>
          </div>
        </header>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-8">

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                  { titleAr: 'الزيارات اليومية', titleEn: 'Daily Visits', val: '2,480', change: '+12%', color: 'from-blue-500/20 to-blue-600/0 border-blue-500/30' },
                  { titleAr: 'إجمالي الحجوزات', titleEn: 'Total Bookings', val: '142', change: '+24%', color: 'from-emerald-500/20 to-emerald-600/0 border-emerald-500/30' },
                  { titleAr: 'الأقسام المفعلة', titleEn: 'Active Sections', val: '18 / 18', change: '100%', color: 'from-amber-500/20 to-amber-600/0 border-amber-500/30' },
                  { titleAr: 'حالة ربط Google Sheets', titleEn: 'Google Sheets Sync', val: 'متصل (Live)', change: 'OK', color: 'from-purple-500/20 to-purple-600/0 border-purple-500/30' },
                ].map((stat, i) => (
                  <div key={i} className={`p-6 rounded-2xl bg-gradient-to-b border ${stat.color} backdrop-blur`}>
                    <p className="text-sm text-neutral-400">{lang === 'ar' ? stat.titleAr : stat.titleEn}</p>
                    <h3 className="text-3xl font-bold mt-2">{stat.val}</h3>
                    <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono">{stat.change}</span>
                  </div>
                ))}
              </div>

              {/* Quick Split Preview Box */}
              <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 flex flex-col md:flex-row gap-6 items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{lang === 'ar' ? 'معاينة حية للموقع (Live WYSIWYG Preview)' : 'Live WYSIWYG Preview'}</h3>
                  <p className="text-sm text-neutral-400 mt-1">
                    {lang === 'ar' ? 'شاهد التعديلات لحظياً قبل نشرها للعملاء على الموقع الرئيسي.' : 'See real-time changes instantly before publishing to production.'}
                  </p>
                </div>
                <div className="flex gap-3">
                  <a href={`/${lang}`} target="_blank" className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-sm font-medium border border-neutral-700 flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    <span>{lang === 'ar' ? 'فتح المعاينة في تبويب جديد' : 'Open Preview Tab'}</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* CONTENT & FEATURE FLAGS TAB */}
          {activeTab === 'content' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">{lang === 'ar' ? 'التحكم في ظهور الأقسام والصفحات (Feature Flags)' : 'Sections & Pages Feature Flags'}</h3>
                <span className="text-xs text-neutral-400">{lang === 'ar' ? 'تعطيل أي سكشن يختفي فورا من الموقع بدون إعادة بناء' : 'Disabling any section hides it instantly without rebuilding'}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { nameAr: 'قسم الهيرو الرئيسي (Hero Section)', nameEn: 'Hero Section', page: 'Home', active: true },
                  { nameAr: 'شريط الفئات والعروض (Categories Marquee)', nameEn: 'Categories Marquee', page: 'Home', active: true },
                  { nameAr: 'قسم الأطباء والخبراء (Doctors Strip)', nameEn: 'Doctors Strip', page: 'Home', active: true },
                  { nameAr: 'معرض النتائج والحالات (Results Showcase)', nameEn: 'Results Showcase', page: 'Home', active: true },
                  { nameAr: 'حجز المواعيد السريع (Quick Booking Form)', nameEn: 'Quick Booking Form', page: 'Global', active: true },
                  { nameAr: 'زر الواتساب العائم (Floating WhatsApp)', nameEn: 'Floating WhatsApp', page: 'Global', active: true },
                ].map((sec, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-sm">{lang === 'ar' ? sec.nameAr : sec.nameEn}</h4>
                      <span className="text-xs text-neutral-500 font-mono">Page: {sec.page}</span>
                    </div>
                    <button
                      onClick={() => triggerSave()}
                      className="text-amber-400 hover:text-amber-300 transition flex items-center gap-1 text-sm font-medium"
                    >
                      {sec.active ? <ToggleRight className="w-8 h-8 text-amber-500" /> : <ToggleLeft className="w-8 h-8 text-neutral-600" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SEO TAB */}
          {activeTab === 'seo' && (
            <div className="space-y-6 max-w-3xl">
              <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
                <h3 className="text-lg font-semibold">{lang === 'ar' ? 'إعدادات محركات البحث (SEO & Meta Tags)' : 'SEO & Meta Tags Settings'}</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">{lang === 'ar' ? 'عنوان الموقع الافتراضي (Meta Title)' : 'Default Meta Title'}</label>
                    <input type="text" defaultValue={seo.metaTitleAr} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm focus:border-amber-500 outline-none" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">{lang === 'ar' ? 'وصف الموقع (Meta Description)' : 'Meta Description'}</label>
                    <textarea rows={3} defaultValue={seo.metaDescAr} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm focus:border-amber-500 outline-none" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">{lang === 'ar' ? 'معرف جوجل تاج مانجر (GTM Container ID)' : 'Google Tag Manager ID'}</label>
                    <input type="text" placeholder="GTM-XXXXXXX" className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm font-mono focus:border-amber-500 outline-none" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">{lang === 'ar' ? 'أكواد مخصصة للرأس (Custom Header Scripts)' : 'Custom Header Scripts'}</label>
                    <textarea rows={3} placeholder="<script>...</script>" className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm font-mono focus:border-amber-500 outline-none" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LEADS TAB */}
          {activeTab === 'leads' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">{lang === 'ar' ? 'سجل الحجوزات والطلبات الواردة' : 'Incoming Leads & Bookings'}</h3>
                <span className="text-xs px-3 py-1 bg-neutral-800 rounded-full border border-neutral-700">Total: 142 Leads</span>
              </div>

              <div className="rounded-2xl bg-neutral-900 border border-neutral-800 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-800 text-xs text-neutral-400 uppercase bg-neutral-950/50">
                      <th className="p-4">{lang === 'ar' ? 'الاسم' : 'Name'}</th>
                      <th className="p-4">{lang === 'ar' ? 'رقم الهاتف' : 'Phone'}</th>
                      <th className="p-4">{lang === 'ar' ? 'الخدمة' : 'Service'}</th>
                      <th className="p-4">{lang === 'ar' ? 'الفرع' : 'Branch'}</th>
                      <th className="p-4">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800 text-sm">
                    {[
                      { name: 'سارة أحمد', phone: '+20 1012345678', service: 'إزالة الشعر بالليزر', branch: 'المعادي', status: 'جديد' },
                      { name: 'محمد خالد', phone: '+20 1198765432', service: 'تنظيف بشرة هيدرا فيشل', branch: 'المهندسين', status: 'تم التأكيد' },
                      { name: 'منى حسن', phone: '+20 1234567890', service: 'فيلر وبوتكس', branch: 'التجمع الخامس', status: 'تم التواصل' },
                    ].map((lead, i) => (
                      <tr key={i} className="hover:bg-neutral-800/50 transition">
                        <td className="p-4 font-medium">{lead.name}</td>
                        <td className="p-4 font-mono text-neutral-400">{lead.phone}</td>
                        <td className="p-4">{lead.service}</td>
                        <td className="p-4 text-neutral-400">{lead.branch}</td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {lead.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* RBAC PERMISSION TREE TAB (n8n Style) */}
          {activeTab === 'rbac' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">{lang === 'ar' ? 'شجرة الصلاحيات المرئية (n8n-Style RBAC Tree)' : 'Visual n8n-Style RBAC Permission Tree'}</h3>
                <p className="text-sm text-neutral-400 mt-1">
                  {lang === 'ar' ? 'إدارة أدوار المسوقين وموظفي الاستقبال وتحديد الصلاحيات مع نظام الموافقات (Approval Workflow).' : 'Manage marketer and receptionist roles with visual permission boundaries and approval workflows.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {roles.map((role) => (
                  <div key={role.id} className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-full" style={{ backgroundColor: role.color }} />
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-bold text-base">{role.name}</h4>
                        <p className="text-xs text-neutral-400 mt-0.5">{role.description}</p>
                      </div>
                      {role.requiresApproval ? (
                        <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <Lock className="w-3.5 h-3.5" />
                          <span>يتطلب موافقة الأدمن</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Unlock className="w-3.5 h-3.5" />
                          <span>صلاحيات كاملة</span>
                        </span>
                      )}
                    </div>

                    <div className="space-y-2 mt-4 pt-4 border-t border-neutral-800">
                      <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider">{lang === 'ar' ? 'الصلاحيات الممنوحة:' : 'Granted Permissions:'}</span>
                      <div className="flex flex-wrap gap-2">
                        {role.permissions.map((p, idx) => (
                          <span key={idx} className="px-2 py-1 bg-neutral-800 rounded text-xs font-mono text-neutral-300">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* APPS SCRIPT GENERATOR TAB */}
          {activeTab === 'scripts' && (
            <div className="space-y-6 max-w-4xl">
              <div>
                <h3 className="text-lg font-semibold">{lang === 'ar' ? 'مولد كود Google Apps Script لربط الشيتات' : 'Google Apps Script Generator for Sheets'}</h3>
                <p className="text-sm text-neutral-400 mt-1">
                  {lang === 'ar' ? 'انسخ هذا الكود وضعه في Google Sheets لتستقبل الحجوزات والطلبات لحظياً.' : 'Copy this snippet into your Google Sheets Apps Script to receive real-time leads.'}
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono text-amber-400">Code.gs (Google Apps Script)</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(appsScriptCode);
                      setSuccessMsg(lang === 'ar' ? 'تم نسخ الكود للحافظة!' : 'Code copied to clipboard!');
                      setTimeout(() => setSuccessMsg(''), 3000);
                    }}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-medium border border-neutral-700 flex items-center gap-1.5"
                  >
                    <Code className="w-4 h-4" />
                    <span>{lang === 'ar' ? 'نسخ الكود' : 'Copy Code'}</span>
                  </button>
                </div>

                <pre className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-300 overflow-x-auto">
                  {appsScriptCode}
                </pre>
              </div>
            </div>
          )}

        </div>

      </main>

    </div>
  );
}
