import { prisma } from '@/lib/prisma';
import { PageConfig, SeoConfig, Lead, RoleNode } from './types';

export const SiteDashEngine = {
  // --- Pages & Sections ---
  async getPages(): Promise<PageConfig[]> {
    try {
      const pages = await prisma.sitePage.findMany({
        include: { sections: true },
      });
      return pages.map((p) => ({
        id: p.id,
        slug: p.slug,
        titleEn: p.titleEn,
        titleAr: p.titleAr,
        enabled: p.enabled,
        sections: p.sections.map((s) => ({
          id: s.id,
          nameEn: s.nameEn,
          nameAr: s.nameAr,
          enabled: s.enabled,
          content: (s.content as Record<string, any>) || {},
        })),
      }));
    } catch {
      return [];
    }
  },

  async updatePage(pageId: string, updates: Partial<PageConfig>) {
    try {
      await prisma.sitePage.update({
        where: { id: pageId },
        data: {
          titleEn: updates.titleEn,
          titleAr: updates.titleAr,
          enabled: updates.enabled,
        },
      });
    } catch (e) {
      console.error('Failed to update page:', e);
    }
  },

  async toggleSection(sectionId: string, enabled: boolean) {
    try {
      await prisma.siteSection.update({
        where: { id: sectionId },
        data: { enabled },
      });
    } catch (e) {
      console.error('Failed to toggle section:', e);
    }
  },

  // --- SEO Settings ---
  async getSeo(): Promise<SeoConfig> {
    try {
      let seo = await prisma.seoSettings.findFirst();
      if (!seo) {
        seo = await prisma.seoSettings.create({
          data: {
            metaTitleEn: 'Shamah Clinics',
            metaTitleAr: 'عيادات شامة',
          },
        });
      }
      return {
        metaTitleEn: seo.metaTitleEn || '',
        metaTitleAr: seo.metaTitleAr || '',
        metaDescEn: seo.metaDescEn || '',
        metaDescAr: seo.metaDescAr || '',
        ogImage: seo.ogImage || '',
        gtmId: seo.gtmId || '',
        customScripts: seo.customScripts || '',
      };
    } catch {
      return {
        metaTitleEn: 'Shamah Clinics',
        metaTitleAr: 'عيادات شامة',
        metaDescEn: '',
        metaDescAr: '',
        ogImage: '',
        gtmId: '',
        customScripts: '',
      };
    }
  },

  async updateSeo(updates: Partial<SeoConfig>) {
    try {
      let seo = await prisma.seoSettings.findFirst();
      if (seo) {
        await prisma.seoSettings.update({
          where: { id: seo.id },
          data: updates,
        });
      } else {
        await prisma.seoSettings.create({
          data: updates,
        });
      }
    } catch (e) {
      console.error('Failed to update SEO:', e);
    }
  },

  // --- Leads CRM ---
  async getLeads(): Promise<Lead[]> {
    try {
      const leads = await prisma.lead.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return leads.map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        service: l.service || '',
        branch: l.branch || '',
        date: l.date || '',
        status: l.status as any,
        createdAt: l.createdAt.toISOString(),
      }));
    } catch {
      return [];
    }
  },

  async addLead(lead: Omit<Lead, 'id' | 'createdAt'>) {
    try {
      await prisma.lead.create({
        data: {
          name: lead.name,
          phone: lead.phone,
          service: lead.service,
          branch: lead.branch,
          date: lead.date,
          status: lead.status || 'new',
        },
      });
    } catch (e) {
      console.error('Failed to add lead:', e);
    }
  },

  // --- RBAC Roles ---
  async getRoles(): Promise<RoleNode[]> {
    try {
      let roles = await prisma.role.findMany();
      if (roles.length === 0) {
        // Seed default roles
        await prisma.role.createMany({
          data: [
            { name: 'Admin', description: 'Full access', permissions: ['all'], requiresApproval: false, color: '#f43f5e' },
            { name: 'Marketer', description: 'Manage leads & SEO', permissions: ['leads.view', 'seo.edit'], requiresApproval: true, color: '#3b82f6' },
          ],
        });
        roles = await prisma.role.findMany();
      }
      return roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description || '',
        permissions: r.permissions,
        requiresApproval: r.requiresApproval,
        color: r.color,
      }));
    } catch {
      return [
        { id: 'admin', name: 'Admin', description: 'Full access', permissions: ['all'], requiresApproval: false, color: '#f43f5e' },
      ];
    }
  },
};
