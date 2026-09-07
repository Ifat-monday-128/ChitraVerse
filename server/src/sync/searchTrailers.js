// Searches public YouTube result pages; does not import TMDB video links.
// Run with --apply to save verified matches, otherwise only writes a report.
require("../config/env");
const fs = require("node:fs/promises");
const path = require("node:path");
const pool = require("../config/db");
const { youtubeId } = require("../utils/trailer");

const dataDirectory = path.resolve(__dirname, "../../../.local-data");
const reportPath = path.join(dataDirectory, "trailer-search.json");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (text) => text.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function extractResults(html) {
  const match = html.match(/(?:var ytInitialData|window\["ytInitialData"\])\s*=\s*(\{.+?\});<\/script>/s);
  if (!match) throw new Error("YouTube did not return searchable results (possibly rate limited).");
  const videos = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.videoRenderer) videos.push(node.videoRenderer);
    else for (const value of Object.values(node)) visit(value);
  }
  visit(JSON.parse(match[1]));
  const plain = (value) => value?.simpleText || value?.runs?.map((r) => r.text).join("") || "";
  return videos.map((video) => ({
    id: video.videoId,
    title: plain(video.title),
    channel: plain(video.ownerText || video.longBylineText),
    description: (video.detailedMetadataSnippets || []).map((s) => plain(s.snippetText)).join(" "),
    verified: (video.ownerBadges || []).some((b) => /VERIFIED/.test(b.metadataBadgeRenderer?.style || "")),
  }));
}

function chooseTrailer(row, videos) {
  const wanted = normalize(row.title).split(" ").filter(Boolean);
  return videos.map((video, position) => {
    const title = normalize(video.title);
    const all = normalize(`${video.title} ${video.description}`);
    if (!youtubeId(video.id) || !/\btrailer\b/i.test(video.title)) return null;
    if (/\b(concept|fan[ -]?made|reaction|review|explained|fake|ai trailer|gameplay)\b/i.test(video.title)) return null;
    const overlap = wanted.filter((word) => title.split(" ").includes(word)).length / wanted.length;
    if (overlap < 0.8) return null;
    const years = video.title.match(/\b(?:19|20)\d{2}\b/g) || [];
    if (years.length && row.year && !years.includes(String(row.year))) return null;
    if (wanted.join("").length < 4 && !all.includes(String(row.year))) return null;
    if (/screen culture|kh studio|sluurp/i.test(video.channel)) return null;
    const studio = /\b(warner bros|paramount|universal pictures|sony pictures|netflix|prime video|lionsgate|a24|marvel|20th century|disney|pixar|hbo|hoichoi|svf|zee studios|yrf|t series|saregama|sun tv|shemaroo)\b/i.test(video.channel);
    const trusted = video.verified || studio || /^(Rotten Tomatoes Trailers|Movieclips|IGN|IGN Movie Trailers|KinoCheck(?:\.com)?|Movie Trailers Source)$/i.test(video.channel);
    if (!trusted) return null;
    return { ...video, score: overlap * 10 + (studio ? 6 : 0) + (video.verified ? 3 : 0) + (/official/i.test(video.title) ? 2 : 0) + (all.includes(String(row.year)) ? 2 : 0) - (/teaser/i.test(video.title) ? 2 : 0) - position / 10 };
  }).filter(Boolean).sort((a, b) => b.score - a.score)[0] || null;
}

async function searchBing(query) {
  const response = await fetch(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(query + " site:youtube.com/watch")}`, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Bing HTTP ${response.status}`);
  const xml = await response.text();
  if (!xml.includes("<rss")) throw new Error("Bing did not return search results.");
  const decode = (text) => text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const results = [];
  for (const item of xml.matchAll(/<item>(.*?)<\/item>/gs)) {
    const link = decode(item[1].match(/<link>(.*?)<\/link>/s)?.[1] || "");
    const id = youtubeId(link);
    if (!id) continue;
    const metadata = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, { signal: AbortSignal.timeout(15000) });
    if (metadata.status === 404 || metadata.status === 401) continue;
    if (!metadata.ok) throw new Error(`YouTube metadata HTTP ${metadata.status}`);
    const video = await metadata.json();
    results.push({ id, title: video.title, channel: video.author_name, verified: false,
      description: decode(item[1].match(/<description>(.*?)<\/description>/s)?.[1] || ""), source: link });
    if (results.length >= 5) break;
  }
  return results;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const all = process.argv.includes("--all");
  const provider = process.argv.includes("--provider=bing") ? "bing" : "youtube";
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
  const { rows } = await pool.query(`SELECT m.title_id, m.title, m.trailer_link,
      EXTRACT(YEAR FROM COALESCE(mo.release_date, s.first_air_date))::int AS year,
      CASE WHEN mo.title_id IS NOT NULL THEN 'movie' ELSE 'TV series' END AS type
    FROM media m LEFT JOIN movie mo USING(title_id) LEFT JOIN series s USING(title_id)
    WHERE ($1 OR m.trailer_link IS NOT NULL) ORDER BY m.title_id`, [all]);
  await fs.mkdir(dataDirectory, { recursive: true });
  const backup = path.join(dataDirectory, `trailers-backup-${Date.now()}.json`);
  await fs.writeFile(backup, JSON.stringify(rows, null, 2));
  let report = {};
  try { report = JSON.parse(await fs.readFile(reportPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const pending = rows.filter((row) => !report[row.title_id] || report[row.title_id].status === "error" || (apply && !report[row.title_id].applied)).slice(0, limit);
  console.log(`Searching ${pending.length} titles; backup: ${backup}`);
  let index = 0;
  let completed = 0;
  let consecutiveErrors = 0;
  // Serialize report writes so concurrent searches cannot overwrite newer results.
  let saving = Promise.resolve();
  await Promise.all(Array.from({ length: provider === "bing" ? 2 : 1 }, async () => {
    while (index < pending.length && consecutiveErrors < 8) {
      const row = pending[index++];
      const query = `${row.title} ${row.year || ""} ${row.type} official trailer`;
      try {
        let videos;
        if (provider === "bing") videos = await searchBing(query);
        else {
          const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
            headers: { "Accept-Language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(25000),
          });
          if (!response.ok) throw new Error(`YouTube HTTP ${response.status}`);
          videos = extractResults(await response.text());
        }
        const match = chooseTrailer(row, videos);
        // Store the path after youtube.com/, not a full URL or an invented path.
        const suffix = match ? `watch?v=${match.id}` : null;
        report[row.title_id] = { title: row.title, query, provider, status: match ? "matched" : "unmatched", checked_at: new Date().toISOString(), match, candidates: videos.slice(0, 4), applied: false };
        if (apply && match) {
          const result = await pool.query("UPDATE media SET trailer_link=$1 WHERE title_id=$2 AND trailer_link IS NOT DISTINCT FROM $3", [suffix, row.title_id, row.trailer_link]);
          report[row.title_id].applied = result.rowCount === 1;
        }
        consecutiveErrors = 0;
      } catch (error) {
        report[row.title_id] = { title: row.title, query, status: "error", error: error.message, applied: false };
        consecutiveErrors++;
      }
      completed++;
      const snapshot = JSON.stringify(report, null, 2);
      saving = saving.then(() => fs.writeFile(reportPath, snapshot));
      await saving;
      if (completed % 25 === 0 || completed === pending.length) console.log(`Searched ${completed}/${pending.length}: ${JSON.stringify(Object.values(report).reduce((counts, item) => { counts[item.status] = (counts[item.status] || 0) + 1; return counts; }, {}))}`);
      await delay(1500);
    }
  }));
  if (consecutiveErrors >= 8) throw new Error("Search stopped after repeated failures. Existing links on failed searches were preserved. Rerun to resume.");
  console.log(`Trailer search complete. Report: ${reportPath}`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
module.exports = { extractResults, chooseTrailer };
