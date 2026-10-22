export interface PageConfig {
  id: string;
  slug: string;
  titleEn: string;
  titleAr: string;
  enabled: boolean;
  sections: {
    id: string;
    nameEn: string;
    nameAr: string;
    enabled: boolean;
    content: Record<string, any>;
  }[];
}

export interface SeoConfig {
  metaTitleEn: string;
  metaTitleAr: string;
  metaDescEn: string;
  metaDescAr: string;
  ogImage: string;
  gtmId: string;
  customScripts: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  service: string;
  branch: string;
  date: string;
  status: 'new' | 'contacted' | 'booked' | 'cancelled';
  createdAt: string;
}

export interface RoleNode {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  requiresApproval: boolean;
  color: string;
}
