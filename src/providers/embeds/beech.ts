import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';

const providers = [
  {
    id: 'beech-faia',
    rank: 22,
    name: 'Faia',
  },
  {
    id: 'beech-buche',
    rank: 15,
    name: 'Buche',
  },
  {
    id: 'beech-english',
    rank: 14,
    name: 'English',
  },
  {
    id: 'beech-hindi',
    rank: 13,
    name: 'Hindi',
  },
];

function embed(provider: { id: string; rank: number; name: string }) {
  return makeEmbed({
    id: provider.id,
    name: provider.name,
    rank: provider.rank,
    async scrape(ctx) {
      return {
        stream: [
          {
            id: 'primary',
            type: 'hls',
            playlist: ctx.url,
            flags: [flags.CORS_ALLOWED],
            captions: [],
          },
        ],
      };
    },
  });
}

export const [beechFaiaScraper, beechBucheScraper, beechEnglishScraper, beechHindiScraper] = providers.map(embed);
