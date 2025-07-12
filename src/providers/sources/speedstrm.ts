import { flags } from '@/entrypoint/utils/targets';
import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';

const servers = [
  { embedId: 'speedstrm-ngflix', server: 1 },
  { embedId: 'speedstrm-upcloud', server: 2 },
  { embedId: 'speedstrm-akcloud', server: 3 },
  { embedId: 'speedstrm-megacloud', server: 4 },
  { embedId: 'speedstrm-vidsrc', server: 6 },
  { embedId: 'speedstrm-hollymoviehd', server: 5 },
  { embedId: 'speedstrm-onionflixer', server: 7 },
  { embedId: 'speedstrm-soaper', server: 8 },
];

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const embeds: SourcererEmbed[] = [];
  const mediaType = ctx.media.type === 'show' ? 'tv' : 'm';
  let id = ctx.media.tmdbId;

  if (ctx.media.type === 'show') {
    id = `${id}/${ctx.media.season.number}/${ctx.media.episode.number}`;
  }

  // Return all possible embeds with the URL they need to scrape
  for (const { embedId, server } of servers) {
    const url = `https://servers.spencerdevs.xyz/${server}/${mediaType}/${id}`;

    embeds.push({
      embedId,
      url,
    });
  }

  ctx.progress(90);

  return {
    embeds,
  };
}

export const spencerdevsScraper = makeSourcerer({
  id: 'spencerdevs',
  name: '☠️ SpeedStrm',
  rank: 240,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
