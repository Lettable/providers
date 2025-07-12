import { flags } from '@/entrypoint/utils/targets';
import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const apiUrl = 'https://beech-api.vercel.app';

interface BeechSource {
  videoUrl: string | null;
  source: string;
  title?: string;
  lang?: string;
  working: boolean;
}

interface BeechResponse {
  sources: BeechSource[];
}

async function comboScraper(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  const tmdbId = ctx.media.tmdbId;

  const data = await ctx.proxiedFetcher<BeechResponse>(`/api/stream/${tmdbId}`, {
    baseUrl: apiUrl,
    headers: {
      Referer: apiUrl,
      Origin: apiUrl,
    },
  });

  if (!data || !data.sources) throw new NotFoundError('Failed to fetch video sources');

  const workingSources = data.sources.filter((source) => source.working && source.videoUrl);
  if (workingSources.length === 0) throw new NotFoundError('No working video sources found');

  ctx.progress(50);

  const faiaEmbeds: SourcererEmbed[] = [];
  const bucheEmbeds: SourcererEmbed[] = [];
  const englishEmbeds: SourcererEmbed[] = [];
  const hindiEmbeds: SourcererEmbed[] = [];

  for (const source of workingSources) {
    // Map source types to embed IDs
    switch (source.source) {
      case 'FAIA':
        faiaEmbeds.push({
          embedId: 'beech-faia',
          url: source.videoUrl!,
        });
        break;
      case 'BUCHE':
        bucheEmbeds.push({
          embedId: 'beech-buche',
          url: source.videoUrl!,
        });
        break;
      case 'BEECH':
        // Distinguish between Hindi and English BEECH sources
        if (source.title?.toLowerCase().includes('hindi')) {
          hindiEmbeds.push({
            embedId: 'beech-hindi',
            url: source.videoUrl!,
          });
        } else {
          englishEmbeds.push({
            embedId: 'beech-english',
            url: source.videoUrl!,
          });
        }
        break;
      default:
        continue; // Skip unknown sources
    }
  }

  const embeds = [...faiaEmbeds, ...bucheEmbeds, ...englishEmbeds, ...hindiEmbeds];

  ctx.progress(90);

  return {
    embeds,
  };
}

export const beechScraper = makeSourcerer({
  id: 'beech',
  name: 'Beech',
  rank: 72,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
});
