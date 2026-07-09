/**
 * Next.js App Router robots.txt endpoint.
 *
 * /robots.txt → buildRobots() çıktısı.
 */
import type { MetadataRoute } from 'next';
import { buildRobots } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}