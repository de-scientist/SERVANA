import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.WEB_BASE_URL ?? 'https://servana.example.com';
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/search`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/products`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
  ];
}
