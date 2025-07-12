/* eslint-disable no-console */
import CryptoJS from 'crypto-js';

import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';
import { NotFoundError } from '@/utils/errors';
import { createM3U8ProxyUrl } from '@/utils/proxy';

const baseUrl = 'https://spencerdevs.xyz';

// Simple obfuscation decoder
function _decode(s: string): string {
  return atob(
    s
      .match(/.{1,2}/g)!
      .reverse()
      .join(''),
  );
}

function decryptPart(enc: string): string {
  return CryptoJS.AES.decrypt(enc, _decode('V5a2')).toString(CryptoJS.enc.Utf8);
}

function generateKeyIV(timestamp: string, d: string, u: string, m: string, s: string) {
  const base = `${timestamp}${_decode('==ZAVlc29vZGJ5b2Nvc2')}${d}${u}${m}${s}`;
  const hash = CryptoJS.SHA256(base).toString();
  const key = CryptoJS.enc.Hex.parse(hash.slice(0, 64));
  const iv = CryptoJS.enc.Hex.parse(hash.slice(0, 32));
  return { key, iv };
}

function decryptSnoopdog(snoopdog: string, d: string, u: string, m: string, s: string): string {
  const now = new Date();

  for (const offset of [0, -1, 1]) {
    const time = new Date(now.getTime() + offset * 60000);
    time.setSeconds(0, 0);
    const timestamp = `${time.toISOString().slice(0, 19)}Z`;

    const { key, iv } = generateKeyIV(timestamp, d, u, m, s);

    try {
      const decrypted = CryptoJS.AES.decrypt(snoopdog, key, {
        iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }).toString(CryptoJS.enc.Utf8);

      if (decrypted) {
        return decrypted;
      }
    } catch (e) {
      continue;
    }
  }

  throw new Error('Failed to decrypt snoopdog with all time offsets');
}

function replaceAnimeboxProxy(url: string): string {
  // Check if the URL contains animebox proxy
  if (!url.includes('animebox.xyz/m3u8-proxy.m3u8')) {
    return url;
  }

  try {
    const urlObj = new URL(url);
    const actualUrl = urlObj.searchParams.get('url');
    const headersParam = urlObj.searchParams.get('headers');

    // Decode the actual URL
    const decodedUrl = actualUrl ? decodeURIComponent(actualUrl) : '';

    // Parse the headers if they exist
    let headers: Record<string, string> = {};
    if (headersParam) {
      const decodedHeaders = decodeURIComponent(headersParam);
      headers = JSON.parse(decodedHeaders);
    }

    // Create our own proxy URL
    return createM3U8ProxyUrl(decodedUrl, headers);
  } catch (error) {
    // If parsing fails, return the original URL
    return url;
  }
}

const providers = [
  {
    id: 'speedstrm-ngflix',
    name: 'Flix',
    rank: 320,
    server: 1,
    disabled: true,
  },
  {
    id: 'speedstrm-upcloud',
    name: 'Air1',
    rank: 319,
    server: 2,
  },
  {
    id: 'speedstrm-akcloud',
    name: 'Air2',
    rank: 318,
    server: 3,
  },
  {
    id: 'speedstrm-megacloud',
    name: 'Cloud',
    rank: 317,
    server: 4,
  },
  {
    id: 'speedstrm-hollymoviehd',
    name: 'HD',
    rank: 315,
    server: 5,
  },
  {
    id: 'speedstrm-vidsrc',
    name: 'Cloudnestra',
    rank: 316,
    server: 6,
  },
  {
    id: 'speedstrm-onionflixer',
    name: 'Crying',
    rank: 314,
    server: 7,
  },
  {
    id: 'speedstrm-soaper',
    name: 'Slippery',
    rank: 313,
    server: 8,
  },
];

function embed(provider: { id: string; name: string; rank: number; server: number; disabled?: boolean }) {
  return makeEmbed({
    id: provider.id,
    name: provider.name,
    rank: provider.rank,
    disabled: provider.disabled,
    async scrape(ctx) {
      const data = await ctx.proxiedFetcher(ctx.url, {
        headers: {
          Referer: baseUrl,
          Origin: baseUrl,
        },
      });

      if (!data || !data.snoopdog || !data.part1 || !data.part2 || !data.part3 || !data.part4) {
        // const debugInfo = {
        //   url: ctx.url,
        //   hasData: !!data,
        //   dataKeys: data ? Object.keys(data) : [],
        //   providerId: provider.id,
        //   server: provider.server,
        // };
        throw new NotFoundError(`Invalid response from server`);
      }

      // Decrypt the parts
      const d = decryptPart(data.part1);
      const u = decryptPart(data.part2);
      const m = decryptPart(data.part3);
      const s = decryptPart(data.part4);

      // Decrypt the final URL
      const finalUrl = decryptSnoopdog(data.snoopdog, d, u, m, s);

      if (!finalUrl || finalUrl.trim() === '') {
        throw new NotFoundError('Failed to decrypt stream URL or URL is empty');
      }

      // Replace animebox proxy with our own proxy
      const processedUrl = replaceAnimeboxProxy(finalUrl);

      // Validate that we have a proper URL after processing
      if (!processedUrl || processedUrl.trim() === '') {
        throw new NotFoundError('Processed URL is empty');
      }

      // Additional check: if it's a proxy URL, make sure the actual URL parameter isn't empty
      if (processedUrl.includes('m3u8-proxy') && processedUrl.includes('url=&')) {
        throw new NotFoundError('Stream URL is empty in proxy parameters');
      }

      return {
        stream: [
          {
            id: 'primary',
            type: 'hls',
            playlist: processedUrl,
            flags: [flags.CORS_ALLOWED],
            captions: [],
          },
        ],
      };
    },
  });
}

export const [
  spencerdevsNgflixScraper,
  spencerdevsUpcloudScraper,
  spencerdevsAkcloudScraper,
  spencerdevsMegacloudScraper,
  spencerdevsHollymoviehd,
  spencerdevsVidsrcScraper,
  spencerdevsOnionflixerScraper,
  spencerdevsSoaperScraper,
] = providers.map(embed);
