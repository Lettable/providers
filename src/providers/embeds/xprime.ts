import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';
import { getValidQualityFromString } from '@/utils/quality';

const serverNames = [
  'primebox',
  'phoenix',
  'primenet',
  'kraken',
  'harbour',
  'volkswagen',
  'fendi',
];

const providers = serverNames.map((serverName) => ({
  id: `xprime-${serverName}`,
  name: `xprime ${serverName}`,
  rank: 70,
  serverName,
}));

function embed(provider: { id: string; name: string; rank: number; serverName: string }) {
  return makeEmbed({
    id: provider.id,
    name: provider.name,
    rank: provider.rank,
    async scrape(ctx) {
      // Parse URL to get title and year
      const [title, year] = ctx.url.split('|');
      
      if (!title || !year) {
        throw new Error('Invalid xprime URL format');
      }

      // Construct API URL
      const apiUrl = `https://backend.xprime.tv/${provider.serverName}?name=${encodeURIComponent(title)}&year=${year}`;
      
      // Headers (as provided)
      const headers = {
        'accept': '*/*',
        'accept-language': 'en-GB,en;q=0.6',
        'origin': 'https://xprime.tv',
        'referer': 'https://xprime.tv/',
        'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Brave";v="138"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'sec-gpc': '1',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      };

      const data = await ctx.proxiedFetcher<{
        status: string;
        streams: Record<string, string>;
        available_qualities: string[];
      }>(apiUrl, { headers });

      if (data.status !== 'ok') {
        throw new Error(`Server ${provider.serverName} returned status: ${data.status}`);
      }

      const qualities: Record<string, { url: string; type: string }> = {};
      
      for (const [qualityLabel, streamUrl] of Object.entries(data.streams)) {
        const quality = getValidQualityFromString(qualityLabel);
        if (quality) {
          qualities[quality] = {
            url: streamUrl,
            type: 'mp4',
          };
        }
      }

      return {
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
    },
  });
}

export default providers.map(embed);
