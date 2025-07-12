import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';
import { NotFoundError } from '@/utils/errors';
import { createM3U8ProxyUrl } from '@/utils/proxy';

const providers = [
  {
    id: 'vidjoy-stream1',
    name: 'Vidjoy 1',
    rank: 102,
  },
  {
    id: 'vidjoy-stream2',
    name: 'Vidjoy 2',
    rank: 109,
  },
  {
    id: 'vidjoy-stream3',
    name: 'Vidjoy 3',
    rank: 108,
  },
  {
    id: 'vidjoy-stream4',
    name: 'Vidjoy 4',
    rank: 107,
  },
  {
    id: 'vidjoy-stream5',
    name: 'Vidjoy 5',
    rank: 113,
  },
];

function embed(provider: { id: string; name: string; rank: number }) {
  return makeEmbed({
    id: provider.id,
    name: provider.name,
    rank: provider.rank,
    async scrape(ctx) {
      // ctx.url contains the JSON stringified stream data (passed from source)
      let streamData;
      try {
        streamData = JSON.parse(ctx.url);
      } catch (error) {
        throw new NotFoundError('Invalid stream data from vidjoy source');
      }

      if (!streamData.link) {
        throw new NotFoundError('No stream URL found in vidjoy data');
      }

      // Validate that we have a proper URL
      if (!streamData.link || streamData.link.trim() === '') {
        throw new NotFoundError('Stream URL is empty');
      }

      // Create proxy URL with headers if provided
      let playlistUrl = streamData.link;
      if (streamData.headers && Object.keys(streamData.headers).length > 0) {
        playlistUrl = createM3U8ProxyUrl(streamData.link, streamData.headers);
      }

      return {
        stream: [
          {
            id: 'primary',
            type: streamData.type || 'hls',
            playlist: playlistUrl,
            flags: [flags.CORS_ALLOWED],
            captions: [],
          },
        ],
      };
    },
  });
}

export const [
  vidjoyStream1Scraper,
  vidjoyStream2Scraper,
  vidjoyStream3Scraper,
  vidjoyStream4Scraper,
  vidjoyStream5Scraper,
] = providers.map(embed);
