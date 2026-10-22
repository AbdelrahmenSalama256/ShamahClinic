import { PageConfig, SeoConfig, Lead, RoleNode } from './types';

// Simple in-memory/JSON store for simplicity as requested,
// can be swapped for Neon SQL/Prisma in documentation later.
let pages: PageConfig[] = [];
let seo: SeoConfig = {
  metaTitleEn: 'Shamah Clinics',
  metaTitleAr: 'عيادات شامة',
  metaDescEn: '',
  metaDescAr: '',
  ogImage: '',
  gtmId: '',
  customScripts: '',
};
let leads: Lead[] = [];
let roles: RoleNode[] = [
  { id: 'admin', name: 'Admin', description: 'Full access', permissions: ['all'], requiresApproval: false, color: '#f43f5e' },
  { id: 'marketer', name: 'Marketer', description: 'Manage leads', permissions: ['leads.view'], requiresApproval: true, color: '#3b82f6' }
];

export const SiteDash = {
  getPages: () => pages,
  updatePage: (pageId: string, updates: Partial<PageConfig>) => {
    pages = pages.map(p => p.id === pageId ? { ...p, ...updates } : p);
  },

  getSeo: () => seo,
  updateSeo: (updates: Partial<SeoConfig>) => {
    seo = { ...seo, ...updates };
  },

  getLeads: () => leads,
  addLead: (lead: Lead) => {
    leads.push(lead);
  },

  getRoles: () => roles,
  updateRoles: (newRoles: RoleNode[]) => {
    roles = newRoles;
  }
};
