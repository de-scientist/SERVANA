import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.WEB_BASE_URL ?? 'https://servana.example.com';
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin/', '/account/', '/api/'] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
