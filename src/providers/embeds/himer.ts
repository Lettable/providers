import { flags } from "@/entrypoint/utils/targets";
import { makeEmbed } from "@/providers/base";
import { NotFoundError } from "@/utils/errors";

const languages = [
  {
    id: "himer-hindi",
    name: "Hindi",
    rank: 180,
    language: "Hindi",
  },
  {
    id: "himer-bengali",
    name: "Bengali",
    rank: 179,
    language: "Bengali",
  },
  {
    id: "himer-tamil",
    name: "Tamil",
    rank: 178,
    language: "Tamil",
  },
  {
    id: "himer-telugu",
    name: "Telugu",
    rank: 177,
    language: "Telugu",
  },
];

function createHimerEmbed(language: {
  id: string;
  name: string;
  rank: number;
  language: string;
}) {
  return makeEmbed({
    id: language.id,
    name: `🌩 Lala Dubbed (${language.name})`,
    rank: language.rank,
    async scrape(ctx) {
      const url = new URL(ctx.url);
      const csrfToken = url.searchParams.get("csrf_token");
      const imdbId = url.searchParams.get("imdb_id");
      const language = url.searchParams.get("language");

      if (!csrfToken || !imdbId) {
        throw new NotFoundError("Missing required parameters in URL");
      }

      const playlistUrl = `${url.origin}${url.pathname}`;

      const streamResponse = await ctx.proxiedFetcher(playlistUrl, {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          referer: `https://himer365ery.com/play/${imdbId}`,
          origin: "https://himer365ery.com/",
          "x-csrf-token": csrfToken,
        },
      });

      if (!streamResponse || typeof streamResponse !== "string") {
        throw new NotFoundError("Invalid stream response");
      }

      const streamUrl = streamResponse.trim();

      if (!streamUrl.includes(".m3u8")) {
        throw new NotFoundError("Invalid m3u8 stream URL");
      }

      return {
        stream: [
          {
            id: "primary",
            type: "hls",
            playlist: streamUrl,
            flags: [flags.CORS_ALLOWED],
            captions: [],
            preferredQuality: {
              type: "unknown",
            },
          },
        ],
      };
    },
  });
}

export const [
  himerHindiScraper,
  himerBengaliScraper,
  himerTamilScraper,
  himerTeluguScraper,
] = languages.map(createHimerEmbed);
