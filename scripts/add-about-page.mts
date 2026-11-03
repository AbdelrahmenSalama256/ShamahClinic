import { loadEnv } from '../src/lib/db/load-env';
loadEnv();
import { db } from '../src/lib/db/index';
import { sql, literal } from 'kysely';

const aboutPage = {
  id: 'about-' + Date.now(),
  route: '/about',
  status: literal<'published'>`'published'`,
  title_ar: 'من نحن',
  title_en: 'About Shamah',
  content_ar: `<p>عيادات شامه وجهة لطب التجميل والليزر والعناية بالبشرة في القاهرة والجيزة، تقوم على فكرة بسيطة: بشرة صحية بنتيجة طبيعية، وقرار طبي واضح بلا مبالغة.</p><p>ابدأوا بزيارة أحد الفروع الثلاثة أو احصلي عنا عبر الواتساب، وسنرشدكم بأي شيء مضن.</p>`,
  content_en: `<p>Shamah Clinics is a destination for aesthetic medicine, laser and skincare in Cairo and Giza, built on a simple idea: healthy skin with natural results, and a clear medical decision without exaggeration.</p><p>Start at any of our three branches or reach us on WhatsApp, and we will guide you through everything.</p>`,
  pub_title_ar: 'من نحن',
  pub_title_en: 'About Shamah',
  pub_content_ar: null,
  pub_content_en: null,
  enabled: literal(1),
  redirect_to: null,
  published_at: new Date().toISOString(),
  legacy_id: null,
};

await db.insertInto('pages').values(aboutPage).execute();
console.log('Inserted About page:', aboutPage.route);
