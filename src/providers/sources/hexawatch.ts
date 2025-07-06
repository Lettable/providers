/* eslint-disable no-console */
import CryptoJS from "crypto-js";
import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { createM3U8ProxyUrl } from '@/utils/proxy';

const Gl = "b21nIHlvdSBmb3VuZCBteSBrZXkgcGxlYXNlIGdvIHRvdWNoIGdyYXNzIHlvdSBsaXR0bGUgZmF0IGJhc2VtZW50IG1vbmtleQ=="; // omg you found my key please go touch grass you little fat basement monkey
const Kl = "aG9wZSB5b3UgaGFkIGZ1biBkZWNyeXB0aW5nIHRoaXMgZ29vZCBqb2Igbm93IGdvIGFzayB5b3VyIG1vbSBmb3IgYSBjb29raWU="; // hope you had fun decrypting this good job now go ask your mom for a cookie

function generateXAuth(type = "movie", tmdbData = {}) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 15);
  const id =
    type === "tv"
      ? `${tmdbData.tmdbId}/${tmdbData.seasonId}/${tmdbData.episodeId}`
      : tmdbData.tmdbId;

  const payloadLevel1 = {
    type,
    id,
    timestamp,
    random,
    checksum: CryptoJS.SHA256(`${type}${id}${timestamp}${random}${Kl}`).toString(),
  };

  const encryptedLevel1 = CryptoJS.AES.encrypt(
    JSON.stringify(payloadLevel1),
    Gl
  ).toString();

  const encryptedLevel2 = CryptoJS.AES.encrypt(
    JSON.stringify({ data: encryptedLevel1, timestamp }),
    `${Gl}${timestamp}`
  ).toString();

  const encryptedLevel3 = CryptoJS.AES.encrypt(
    JSON.stringify({ data: encryptedLevel2, timestamp, random }),
    Kl
  ).toString();

  return encryptedLevel3;
}

function decryptAES(cipher, key, label = "") {
  try {
    const decrypted = CryptoJS.AES.decrypt(cipher, key);
    const utf8 = decrypted.toString(CryptoJS.enc.Utf8);
    if (!utf8) throw new Error("Decryption returned empty string");
    return JSON.parse(utf8);
  } catch (err) {
    console.error(`❌ Error decrypting [${label}]: ${err.message}`);
    return null;
  }
}

function decryptPayload(encryptedStr) {
  const level1 = decryptAES(encryptedStr, Kl, "Level 1");
  if (!level1) return null;

  const level2 = decryptAES(level1.data, Gl + level1.timestamp, "Level 2");
  if (!level2) return null;

  const level3 = decryptAES(level2.data, Gl, "Level 3");
  if (!level3) return null;

  return level3.data;
}

async function hexawatchScrape(ctx: MovieScrapeContext | ShowScrapeContext): Promise<SourcererOutput> {
  const tmdbId = ctx.media.tmdbId;
  if (!tmdbId) throw new NotFoundError('TMDB ID is required');

  const isShow = ctx.media.type === 'show';
  const show = ctx.media;

  const tmdbData = isShow
    ? { tmdbId, seasonId: show.season?.number, episodeId: show.episode?.number }
    : { tmdbId };

  const xAuth = generateXAuth(isShow ? "tv" : "movie", tmdbData);

  const res = await ctx.proxiedFetcher("https://heartbeat.hexa.watch/", {
    method: 'GET',
    headers: {
      'x-auth': xAuth,
      Referer: 'https://hexa.watch/',
      Origin: 'https://hexa.watch',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    },
  });

  const i = await res.json();
  if (!i.encrypted) throw new NotFoundError('No encrypted data found');

  const decrypted = decryptPayload(i.encrypted);
  if (!decrypted || !Array.isArray(decrypted.sources)) throw new NotFoundError('Invalid decrypted data');

  const validSources = decrypted.sources.filter(src => src?.url?.includes(".m3u8"));

  return {
    stream: validSources.map((src, idx) => ({
      id: `hexawatch-${src.server || idx}`,
      type: 'hls',
      playlist: createM3U8ProxyUrl(src.url, {
        referer: 'https://hexa.watch/',
        origin: 'https://hexa.watch',
      }),
      flags: [flags.CORS_ALLOWED],
      captions: [],
    })),
    embeds: [],
  };
}

export const hexawatchScraper = makeSourcerer({
  id: 'hexawatch',
  name: 'HexaWatch 🔐',
  rank: 200,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: hexawatchScrape,
  scrapeShow: hexawatchScrape,
});
