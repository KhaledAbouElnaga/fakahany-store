const SOCIAL_CRAWLER = /WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot|LinkedInBot|Slackbot|Discordbot|Googlebot|bingbot/i;

export async function onRequest(context) {
  const response = await context.next();
  if (context.request.method !== 'GET') return response;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const userAgent = context.request.headers.get('user-agent') || '';
  if (!SOCIAL_CRAWLER.test(userAgent)) return response;

  const baseUrl = context.env.VITE_SUPABASE_URL;
  const anonKey = context.env.VITE_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) return response;

  try {
    const settingsResponse = await fetch(
      `${baseUrl}/rest/v1/shop_settings?id=eq.main&select=store_name,site_name,site_description,hero_subtitle,share_image_url,banner_url,logo_url,phone,address`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Accept: 'application/json'
        },
        cf: { cacheTtl: 300, cacheEverything: true }
      }
    );

    if (!settingsResponse.ok) return response;
    const rows = await settingsResponse.json();
    const settings = rows?.[0];
    if (!settings) return response;

    const title = settings.site_name || settings.store_name || 'المتجر';
    const description = settings.site_description || settings.hero_subtitle || settings.store_name || '';
    const image = settings.share_image_url || settings.banner_url || settings.logo_url || '';
    const requestUrl = new URL(context.request.url);
    const canonicalUrl = `${requestUrl.origin}${requestUrl.pathname}`;
    const schema = JSON.stringify({
      '@context':'https://schema.org',
      '@type':'GroceryStore',
      name:settings.store_name || title,
      url:requestUrl.origin,
      description,
      ...(image?{image}:{}),
      ...(settings.logo_url?{logo:settings.logo_url}:{}),
      ...(settings.phone?{telephone:settings.phone}:{}),
      ...(settings.address?{address:{'@type':'PostalAddress',streetAddress:settings.address}}:{})
    }).replaceAll('<','\\u003c');

    const rewriter = new HTMLRewriter()
      .on('head', { element(el) { el.append(`<link rel="canonical" href="${canonicalUrl}"><script type="application/ld+json">${schema}</script>`,{html:true}); } })
      .on('title', { element(el) { el.setInnerContent(title); } })
      .on('meta[name="description"]', { element(el) { el.setAttribute('content', description); } })
      .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', title); } })
      .on('meta[property="og:description"]', { element(el) { el.setAttribute('content', description); } })
      .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', canonicalUrl); } })
      .on('meta[property="og:image"]', { element(el) { if (image) el.setAttribute('content', image); } })
      .on('meta[property="og:image:secure_url"]', { element(el) { if (image) el.setAttribute('content', image); } })
      .on('meta[name="twitter:title"]', { element(el) { el.setAttribute('content', title); } })
      .on('meta[name="twitter:description"]', { element(el) { el.setAttribute('content', description); } })
      .on('meta[name="twitter:image"]', { element(el) { if (image) el.setAttribute('content', image); } });

    return rewriter.transform(response);
  } catch {
    return response;
  }
}
