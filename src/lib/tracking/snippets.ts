/**
 * The fixed bootstrap each provider gets. Built from a validated ID and nothing else.
 *
 * Every snippet injects its own loader (that is what the vendor's install page prints),
 * so a vendor appears on the page exactly once even if its ID is saved twice: the plan
 * dedupes IDs before this module ever sees them. There is no parameter here that carries
 * text from a form, which is why no console field can become a script box.
 */
import type { ProviderKey, TagPlan } from './providers';

export interface Snippet {
  /** Set only for the one vendor whose loader is a plain script tag (gtag). */
  src: string | null;
  /** Code executed in order after the tag above. Never empty. */
  inline: string;
}

export function providerSnippet(key: ProviderKey, id: string, label = ''): Snippet {
  switch (key) {
    case 'gtm':
      return {
        src: null,
        inline:
          `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});` +
          `var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';` +
          `j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);` +
          `})(window,document,'script','dataLayer','${id}');`,
      };
    case 'ga4':
    case 'ads':
      return {
        src: `https://www.googletagmanager.com/gtag/js?id=${id}`,
        inline:
          `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
          `gtag('js',new Date());gtag('config','${id}'${label ? `,{send_to:'${id}/${label}'}` : ''});`,
      };
    case 'meta':
      return {
        src: null,
        inline:
          `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?` +
          `n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;` +
          `n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;` +
          `s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}` +
          `(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
          `fbq('init','${id}');fbq('track','PageView');`,
      };
    case 'tiktok':
      return {
        src: null,
        inline:
          `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];` +
          `ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie'];` +
          `ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};` +
          `for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);` +
          `ttq.load=function(e,n){var r='https://analytics.tiktok.com/i18n/pixel/events.js';` +
          `ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;` +
          `ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement('script');o.type='text/javascript';` +
          `o.async=!0;o.src=r+'?sdkid='+e+'&lib='+t;var a=d.getElementsByTagName('script')[0];` +
          `a.parentNode.insertBefore(o,a)}}(window,document,'ttq');ttq.load('${id}');ttq.page();`,
      };
    case 'snapchat':
      return {
        src: null,
        inline:
          `(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){` +
          `a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];` +
          `var s='script';var r=t.createElement(s);r.async=!0;r.src=n;` +
          `var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u)})` +
          `(window,document,'https://sc-static.net/scevent.min.js');` +
          `snaptr('init','${id}');snaptr('track','PAGE_VIEW');`,
      };
    case 'clarity':
      return {
        src: null,
        inline:
          `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};` +
          `t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;` +
          `y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})` +
          `(window,document,"clarity","script","${id}");`,
      };
    case 'hotjar':
      return {
        src: null,
        inline:
          `(function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};` +
          `h._hjSettings={hjid:${id},hjsv:6};a=o.getElementsByTagName('head')[0];` +
          `r=o.createElement('script');r.async=1;r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;` +
          `a.appendChild(r)})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`,
      };
    case 'bing':
      return {
        src: null,
        inline:
          `(function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[],f=function(){var o={ti:"${id}",enableAutoSpaTracking:true};` +
          `o.q=w[u],w[u]=new UET(o),w[u].push("pageLoad")},n=d.createElement(t),n.src=r,n.async=1,` +
          `n.onload=n.onreadystatechange=function(){var s=this.readyState;` +
          `s&&s!=="loaded"&&s!=="complete"||(f(),n.onload=n.onreadystatechange=null)},` +
          `i=d.getElementsByTagName(t)[0],i.parentNode.insertBefore(n,i)})` +
          `(window,document,"script","https://bat.bing.com/bat.js","uetq");`,
      };
  }
}

/** One loader and one bootstrap for every Google tag on the page. */
function gtagSnippet(ids: readonly string[], ads: TagPlan['ads']): Snippet {
  const config = ids
    .map((id) => {
      const sendTo = ads && ads.id === id && ads.label ? `,{send_to:'${ads.id}/${ads.label}'}` : '';
      return `gtag('config','${id}'${sendTo});`;
    })
    .join('');
  return {
    src: `https://www.googletagmanager.com/gtag/js?id=${ids[0]}`,
    inline: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${config}`,
  };
}

/** The snippets a plan turns into, in a fixed order so two builds render identically. */
export function snippetPlan(plan: TagPlan): { key: ProviderKey; snippet: Snippet }[] {
  const out: { key: ProviderKey; snippet: Snippet }[] = [];
  if (plan.gtm) out.push({ key: 'gtm', snippet: providerSnippet('gtm', plan.gtm) });
  if (plan.gtagIds.length > 0) out.push({ key: plan.ads ? 'ads' : 'ga4', snippet: gtagSnippet(plan.gtagIds, plan.ads) });
  for (const vendor of plan.vendors) out.push({ key: vendor.key, snippet: providerSnippet(vendor.key, vendor.id) });
  return out;
}

/**
 * The config rows as they are saved. A row can be enabled and valid and still inject
 * nothing (a Tag Manager container owns it); the console reads `plan.suppressed` for that.
 */
export function tagHosts(plan: TagPlan): string[] {
  const text = snippetPlan(plan)
    .map((entry) => `${entry.snippet.src ?? ''}\n${entry.snippet.inline}`)
    .join('\n');
  const hosts = new Set<string>();
  for (const match of text.matchAll(/https:\/\/([a-z0-9.-]+)\//g)) hosts.add(match[1]);
  return [...hosts].sort();
}
