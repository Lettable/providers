/* eslint-disable no-console */
import CryptoJS from "crypto-js";
import { flags } from "@/entrypoint/utils/targets";
import { SourcererOutput, makeSourcerer } from "@/providers/base";
import { MovieScrapeContext, ShowScrapeContext } from "@/utils/context";
import { NotFoundError } from "@/utils/errors";
import { createM3U8ProxyUrl } from "@/utils/proxy";
import type { ShowMedia } from "@/entrypoint/utils/media";

// 🔐 Encryption keys
const Gl =
  "b21nIHlvdSBmb3VuZCBteSBrZXkgcGxlYXNlIGdvIHRvdWNoIGdyYXNzIHlvdSBsaXR0bGUgZmF0IGJhc2VtZW50IG1vbmtleQ=="; // omg you found my key please go touch grass you little fat basement monkey
const Kl =
  "aG9wZSB5b3UgaGFkIGZ1biBkZWNyeXB0aW5nIHRoaXMgZ29vZCBqb2Igbm93IGdvIGFzayB5b3VyIG1vbSBmb3IgYSBjb29raWU="; // hope you had fun decrypting this good job now go ask your mom for a cookie

// 🧠 Types
type StreamSource = {
  server?: string;
  url: string;
};

type TimedStream = StreamSource & {
  latency: number;
};

interface TMDBMovieData {
  tmdbId: string;
}

interface TMDBEpisodeData extends TMDBMovieData {
  seasonId: string | number;
  episodeId: string | number;
}

interface PayloadLevel1 {
  type: string;
  id: string;
  timestamp: number;
  random: string;
  checksum: string;
}

interface PayloadLevel2 {
  data: string;
  timestamp: number;
}

interface PayloadLevel3 {
  data: string;
  timestamp: number;
  random: string;
}

interface DecryptedSource {
  server?: string;
  url: string;
}

interface DecryptedPayload {
  sources: DecryptedSource[];
}

// 🔐 X-AUTH generator
function generateXAuth(
  type: "movie" | "tv",
  tmdbData: TMDBMovieData | TMDBEpisodeData
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 15);

  const id =
    type === "tv"
      ? `${tmdbData.tmdbId}/${(tmdbData as TMDBEpisodeData).seasonId}/${(tmdbData as TMDBEpisodeData).episodeId}`
      : tmdbData.tmdbId;

  const payloadLevel1: PayloadLevel1 = {
    type,
    id,
    timestamp,
    random,
    checksum: CryptoJS.SHA256(
      `${type}${id}${timestamp}${random}${Kl}`
    ).toString(),
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

// 🔓 AES decryption helper
function decryptAES<T>(cipher: string, key: string, label = ""): T | null {
  try {
    const decrypted = CryptoJS.AES.decrypt(cipher, key);
    const utf8 = decrypted.toString(CryptoJS.enc.Utf8);
    if (!utf8) throw new Error("Decryption returned empty string");
    return JSON.parse(utf8) as T;
  } catch (err) {
    console.error(`❌ Error decrypting [${label}]: ${(err as Error).message}`);
    return null;
  }
}

// 🔓 Decrypt all 3 levels
function decryptPayload(encryptedStr: string): DecryptedPayload | null {
  const level1 = decryptAES<PayloadLevel3>(encryptedStr, Kl, "Level 1");
  if (!level1) return null;

  const level2 = decryptAES<PayloadLevel2>(
    level1.data,
    Gl + level1.timestamp,
    "Level 2"
  );
  if (!level2) return null;

  const level3 = decryptAES<DecryptedPayload>(level2.data, Gl, "Level 3");
  if (!level3) return null;

  return level3;
}

// 🔍 Best stream finder
async function findBestStream(
  sources: StreamSource[]
): Promise<StreamSource | null> {
  const timedResults: (TimedStream | null)[] = await Promise.all(
    sources.map(async (src): Promise<TimedStream | null> => {
      const start = Date.now();

      try {
        const res = await fetch(src.url, {
          method: "GET",
          headers: { Range: "bytes=0-1" },
        });

        if (!res.ok) throw new Error(`Status ${res.status}`);

        const latency = Date.now() - start;
        return { ...src, latency };
      } catch (err) {
        console.warn(`❌ Failed to fetch ${src.url}: ${err}`);
        return null;
      }
    })
  );

  const working = timedResults.filter((r): r is TimedStream => r !== null);
  if (working.length === 0) return null;

  working.sort((a, b) => a.latency - b.latency);
  return working[0];
}

// 🔍 Scraper handler
async function hexawatchScrape(
  ctx: MovieScrapeContext | ShowScrapeContext
): Promise<SourcererOutput> {
  const tmdbId = ctx.media.tmdbId;
  if (!tmdbId) throw new NotFoundError("TMDB ID is required");

  const isShow = ctx.media.type === "show";

  const tmdbData = isShow
    ? {
        tmdbId,
        seasonId: (ctx.media as ShowMedia).season?.number ?? "",
        episodeId: (ctx.media as ShowMedia).episode?.number ?? "",
      }
    : { tmdbId };

  const xAuth = generateXAuth(isShow ? "tv" : "movie", tmdbData);

  const res = await ctx.proxiedFetcher("https://heartbeat.hexa.watch", {
    method: "GET",
    headers: {
      "x-auth": xAuth,
      Referer: "https://hexa.watch/",
      Origin: "https://hexa.watch/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    },
  });
  const i = JSON.parse(res);
  if (!i.encrypted) throw new NotFoundError("No encrypted data found");

  const decrypted = decryptPayload(i.encrypted);
  if (!decrypted?.sources?.length) throw new NotFoundError("No valid sources");

  const streamSources: StreamSource[] = Object.values(decrypted.sources).filter(
    (s): s is StreamSource => s?.url?.includes(".m3u8")
  );

  const best = await findBestStream(streamSources);

  if (!best) throw new NotFoundError("No working m3u8 found");

  return {
    stream: [
      {
        id: `hexawatch-${best.server || "main"}`,
        type: "hls",
        playlist: createM3U8ProxyUrl(best.url, {
          referer: "https://hexa.watch/",
          origin: "https://hexa.watch/",
        }),
        flags: [flags.CORS_ALLOWED],
        captions: [],
      },
    ],
    embeds: [],
  };
}

// 🧠 Register it
export const hexawatchScraper = makeSourcerer({
  id: "hexawatch",
  name: "☠️ HexaWatch",
  rank: 203,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: hexawatchScrape,
  scrapeShow: hexawatchScrape,
});
