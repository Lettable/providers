import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { Qualities } from '@/providers/streams';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://proxyv1.vidify.top/proxy';
const apiBase = 'https://api.vidify.top';

interface VidifyResponse {
  url: string;
  hasMultiQuality: boolean;
  quality: Array<{
    url: string;
    quality: string;
  }>;
}

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  let apiUrl: string;
  if (ctx.media.type === 'movie') {
    apiUrl = `${apiBase}/movie/${ctx.media.tmdbId}?sr=2`;
  } else {
    apiUrl = `${apiBase}/tv/${ctx.media.tmdbId}?s=${ctx.media.season.number}&e=${ctx.media.episode.number}&sr=2`;
  }

  const data = await ctx.proxiedFetcher<VidifyResponse>(baseUrl, {
    query: {
      url: apiUrl,
    },
    headers: {
      referer: 'https://player.vidify.top/',
    },
  });

  if (!data || !data.quality || data.quality.length === 0) {
    throw new NotFoundError('No sources found');
  }

  ctx.progress(50);

  const qualities: Partial<Record<Qualities, { type: 'mp4'; url: string }>> = {};

  for (const source of data.quality) {
    // Extract quality number from strings like "360P", "480P", "1080P"
    const qualityMatch = source.quality.match(/(\d+)P?/i);
    const qualityKey = qualityMatch ? qualityMatch[1] : 'unknown';

    qualities[qualityKey as Qualities] = {
      type: 'mp4',
      url: source.url,
    };
  }
  if (!data.hasMultiQuality && data.url && Object.keys(qualities).length === 0) {
    qualities.unknown = {
      type: 'mp4',
      url: data.url,
    };
  }

  ctx.progress(90);

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        type: 'file',
        qualities,
        flags: [flags.CORS_ALLOWED],
        captions: [],
      },
    ],
  };
}

export const vidifyScraper = makeSourcerer({
  id: 'vidify',
  name: '🔥 Vidify',
  rank: 132,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
