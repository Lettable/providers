import { flags } from "@/entrypoint/utils/targets";
import {
  SourcererEmbed,
  SourcererOutput,
  makeSourcerer,
} from "@/providers/base";
import { MovieScrapeContext, ShowScrapeContext } from "@/utils/context";

interface HimerPlayerConfig {
  key: string;
  file: string;
  kp: string;
}

interface TmdbResponse {
  imdb_id: string;
}

interface HimerDubResponse {
  title: string;
  id: string;
  translator: string;
  targets: string;
  file: string;
}

async function getImdbIdFromTmdb(tmdbId: string): Promise<string> {
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=280708382d8a47906ec6f50d4e737302`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch IMDb ID from TMDB");
  const data: TmdbResponse = await res.json();
  if (!data.imdb_id) throw new Error("IMDb ID not found in TMDB response");
  return data.imdb_id;
}

async function comboScraper(
  ctx: ShowScrapeContext | MovieScrapeContext
): Promise<SourcererOutput> {
  const embeds: SourcererEmbed[] = [];

  const tmdbId = ctx.media.tmdbId;

  if (!tmdbId) {
    throw new Error("TMDB ID required for Himer365ery");
  }
  let imdbId;
  imdbId = await getImdbIdFromTmdb(tmdbId);

  const playerPageUrl = `https://himer365ery.com/play/${imdbId}`;
  const playerPageResponse = await ctx.proxiedFetcher(playerPageUrl, {
    headers: {
      referer: "https://allmovieland.ac/",
    },
  });
  const scriptRegex = /let pc = ({.*?});/s;
  const scriptMatch = playerPageResponse.match(scriptRegex);

  if (!scriptMatch) {
    throw new Error(`Could not find player config in response.\nSnippet:\n${playerPageResponse}`);

  }

  const playerConfig: HimerPlayerConfig = JSON.parse(scriptMatch[1]);
  console.log("match", scriptMatch[1]);
  if (!playerConfig.key || !playerConfig.file) {
    throw new Error("Missing key or file in player config");
  }

  ctx.progress(30);

  const playlistUrl = `${playerConfig.file}`;
  const dubResponse = await ctx.proxiedFetcher<HimerDubResponse[]>(
    playlistUrl,
    {
      headers: {
        origin: "https://himer365ery.com",
        referer: `https://himer365ery.com/play/${imdbId}`,
        "x-csrf-token": playerConfig.key,
        "content-type": "application/x-www-form-urlencoded",
      },
    }
  );

  ctx.progress(60);

  if (Array.isArray(dubResponse)) {
    for (const dub of dubResponse) {
      const embedId = `himer-${dub.title.toLowerCase()}`;

      const embedUrl = new URL(
        `https://himer365ery.com/playlist/${dub.file}!.txt`
      );
      embedUrl.searchParams.set("csrf_token", playerConfig.key);
      embedUrl.searchParams.set("imdb_id", imdbId);
      embedUrl.searchParams.set("language", dub.title);
      embedUrl.searchParams.set("translator", dub.translator);
      console.log("token", playerConfig.key);
      embeds.push({
        embedId,
        url: embedUrl.toString(),
      });
    }
  }

  ctx.progress(90);

  return {
    embeds,
  };
}

export const himer365eryScraper = makeSourcerer({
  id: "lallandAhh",
  name: "🌩 Lala Dubbed",
  rank: 181,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
