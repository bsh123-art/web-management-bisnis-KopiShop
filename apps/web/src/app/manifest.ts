import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kopi POS',
    short_name: 'Kopi POS',
    description: 'Coffee shop point of sale, inventory and analytics app.',
    start_url: '/',
    display: 'standalone',
    background_color: '#171310',
    theme_color: '#1f120b',
    orientation: 'portrait-primary',
    scope: '/',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
