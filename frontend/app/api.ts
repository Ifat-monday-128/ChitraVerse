export type Media = {
  chitraverse_rating?: string | null; chitraverse_vote_count?: number;
  title_id: number; title: string; poster: string | null; description?: string | null;
  tmdb_rating: string | null; media_type: "movie" | "series"; runtime?: number | null;
  release_date?: string | null; first_air_date?: string | null; language?: string; trailer_link?: string | null;
  genres?: { name: string }[];
  cast_crew?: { cast_crew_id: number; name: string; photo: string | null; role_type: string }[];
  production_companies?: Company[];
  seasons?: { season_id: number; season_number: number; total_episode: number }[];
};
export type User = { user_id: number; name: string; email: string; role: string | null };
export type Company = { company_id: number; name: string; country: string | null; logo: string | null };
export type Person = {
  cast_crew_id: number; name: string; photo: string | null; biography: string | null;
  date_of_birth: string | null; deathday: string | null; age: number | null;
  place_of_birth: string | null; profile_source: "library";
  filmography: (Media & { tmdb_id: number | null; roles: string[] })[];
};
export type Results = { items: Media[]; total: number; hasMore: boolean };
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  const response = await fetch(base.replace(/\/$/, "") + path, {
    ...options, credentials: "include",
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const detail = data && typeof data === "object" && "error" in data ? String(data.error) : "The request could not be completed.";
    throw new ApiError(detail, response.status);
  }
  return data as T;
}
export function posterUrl(poster: string | null, size = "w500") {
  if (!poster) return undefined;
  if (/^\/[A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)$/i.test(poster)) return `https://image.tmdb.org/t/p/${size}${poster}`;
  if (/^https:\/\//i.test(poster)) return poster;
  return undefined;
}
export function trailerUrl(value?: string | null) {
  if (!value) return undefined;
  if (/^watch\?v=[A-Za-z0-9_-]{11}$/.test(value)) return `https://www.youtube.com/${value}`;
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return `https://www.youtube.com/watch?v=${value}`;
  return undefined;
}
export function trailerEmbedUrl(value?: string | null) {
  const url = trailerUrl(value);
  if (!url) return undefined;
  const id = new URL(url).searchParams.get("v");
  return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1` : undefined;
}
