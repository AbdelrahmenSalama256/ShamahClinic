'use client';

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, FileText, Settings, Shield, Users, Database,
  Code, Eye, Globe, ToggleLeft, ToggleRight, Plus, Save, RefreshCw,
  CheckCircle2, AlertTriangle, ChevronRight, Lock, Unlock, ArrowUpRight
} from 'lucide-react';

export default function SiteDashAdminPage({ params }: { params: { lang: string } }) {
  const [lang, setLang] = useState<'ar' | 'en'>(params.lang === 'ar' ? 'ar' : 'en');
  const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'seo' | 'leads' | 'rbac' | 'scripts'>('overview');
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');

  // Data states
  const [pages, setPages] = useState<any[]>([]);
  const [seo, setSeo] = useState<any>({});
  const [leads, setLeads] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sitedash/config');
      const json = await res.json();
      if (json.ok) {
        setPages(json.data.pages || []);
        setSeo(json.data.seo || {});
        setRoles(json.data.roles || []);
      }

      const leadsRes = await fetch('/api/sitedash/leads');
      const leadsJson = await leadsRes.json();
      if (leadsJson.ok) {
        setLeads(leadsJson.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch SiteDash data:', e);
    } finally {
      setLoading(false);
    }
  };

  const saveSeo = async () => {
    try {
      const res = await fetch('/api/sitedash/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateSeo', payload: seo }),
      });
      const json = await res.json();
      if (json.ok) {
        setSuccessMsg(lang === 'ar' ? 'تم حفظ إعدادات SEO بنجاح!' : 'SEO settings saved successfully!');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (e) {
      console.error('Failed to save SEO:', e);
    }
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
              <p className="text-xs text-neutral-400">Shamah Native Backend CMS</p>
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
              onClick={fetchData}
              className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs font-medium border border-neutral-700 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{lang === 'ar' ? 'تحديث البيانات' : 'Refresh'}</span>
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
                  { titleAr: 'إجمالي الحجوزات', titleEn: 'Total Leads', val: leads.length, change: 'Live DB', color: 'from-emerald-500/20 to-emerald-600/0 border-emerald-500/30' },
                  { titleAr: 'الصفحات المسجلة', titleEn: 'Registered Pages', val: pages.length, change: 'Active', color: 'from-blue-500/20 to-blue-600/0 border-blue-500/30' },
                  { titleAr: 'أدوار الصلاحيات', titleEn: 'RBAC Roles', val: roles.length, change: 'Protected', color: 'from-amber-500/20 to-amber-600/0 border-amber-500/30' },
                  { titleAr: 'حالة قاعدة البيانات', titleEn: 'Database Status', val: 'متصل (Neon SQL)', change: 'OK', color: 'from-purple-500/20 to-purple-600/0 border-purple-500/30' },
                ].map((stat, i) => (
                  <div key={i} className={`p-6 rounded-2xl bg-gradient-to-b border ${stat.color} backdrop-blur`}>
                    <p className="text-sm text-neutral-400">{lang === 'ar' ? stat.titleAr : stat.titleEn}</p>
                    <h3 className="text-3xl font-bold mt-2">{stat.val}</h3>
                    <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono">{stat.change}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CONTENT & FEATURE FLAGS TAB */}
          {activeTab === 'content' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">{lang === 'ar' ? 'التحكم في ظهور الأقسام والصفحات (Feature Flags)' : 'Sections & Pages Feature Flags'}</h3>
                <span className="text-xs text-neutral-400">{lang === 'ar' ? 'مستمد مباشرة من قاعدة البيانات' : 'Fetched directly from database'}</span>
              </div>

              <div className="space-y-4">
                {pages.map((page) => (
                  <div key={page.id} className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                      <div>
                        <h4 className="font-bold text-base">{lang === 'ar' ? page.titleAr : page.titleEn}</h4>
                        <span className="text-xs text-neutral-500 font-mono">Slug: /{page.slug}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {page.sections?.map((sec: any) => (
                        <div key={sec.id} className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
                          <span className="text-sm">{lang === 'ar' ? sec.nameAr : sec.nameEn}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-mono ${sec.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-neutral-800 text-neutral-400'}`}>
                            {sec.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      ))}
                    </div>
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
                    <input
                      type="text"
                      value={seo.metaTitleAr || ''}
                      onChange={(e) => setSeo({ ...seo, metaTitleAr: e.target.value })}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm focus:border-amber-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">{lang === 'ar' ? 'وصف الموقع (Meta Description)' : 'Meta Description'}</label>
                    <textarea
                      rows={3}
                      value={seo.metaDescAr || ''}
                      onChange={(e) => setSeo({ ...seo, metaDescAr: e.target.value })}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm focus:border-amber-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">{lang === 'ar' ? 'معرف جوجل تاج مانجر (GTM Container ID)' : 'Google Tag Manager ID'}</label>
                    <input
                      type="text"
                      value={seo.gtmId || ''}
                      onChange={(e) => setSeo({ ...seo, gtmId: e.target.value })}
                      placeholder="GTM-XXXXXXX"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm font-mono focus:border-amber-500 outline-none"
                    />
                  </div>

                  <button
                    onClick={saveSeo}
                    className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold rounded-xl text-sm transition"
                  >
                    <Save className="w-4 h-4" />
                    <span>{lang === 'ar' ? 'حفظ إعدادات SEO' : 'Save SEO Settings'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* LEADS TAB */}
          {activeTab === 'leads' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">{lang === 'ar' ? 'سجل الحجوزات والطلبات الواردة (Database)' : 'Incoming Leads & Bookings (Database)'}</h3>
                <span className="text-xs px-3 py-1 bg-neutral-800 rounded-full border border-neutral-700">Total: {leads.length}</span>
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
                    {leads.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-neutral-500">
                          {lang === 'ar' ? 'لا توجد حجوزات مسجلة حتى الآن.' : 'No leads recorded yet.'}
                        </td>
                      </tr>
                    ) : (
                      leads.map((lead: any, i: number) => (
                        <tr key={i} className="hover:bg-neutral-800/50 transition">
                          <td className="p-4 font-medium">{lead.name}</td>
                          <td className="p-4 font-mono text-neutral-400">{lead.phone}</td>
                          <td className="p-4">{lead.service || '—'}</td>
                          <td className="p-4 text-neutral-400">{lead.branch || '—'}</td>
                          <td className="p-4">
                            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              {lead.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
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
                  {lang === 'ar' ? 'مستمدة من جدول الأدوار في قاعدة البيانات.' : 'Fetched from the database roles table.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {roles.map((role: any) => (
                  <div key={role.id} className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-full" style={{ backgroundColor: role.color || '#f43f5e' }} />
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-bold text-base">{role.name}</h4>
                        <p className="text-xs text-neutral-400 mt-0.5">{role.description}</p>
                      </div>
                      {role.requiresApproval ? (
                        <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <Lock className="w-3.5 h-3.5" />
                          <span>{lang === 'ar' ? 'يتطلب موافقة الأدمن' : 'Requires Approval'}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Unlock className="w-3.5 h-3.5" />
                          <span>{lang === 'ar' ? 'صلاحيات كاملة' : 'Full Access'}</span>
                        </span>
                      )}
                    </div>

                    <div className="space-y-2 mt-4 pt-4 border-t border-neutral-800">
                      <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider">{lang === 'ar' ? 'الصلاحيات الممنوحة:' : 'Granted Permissions:'}</span>
                      <div className="flex flex-wrap gap-2">
                        {role.permissions?.map((p: string, idx: number) => (
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
