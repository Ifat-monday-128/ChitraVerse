function youtubeId(value) {
  if (!value || typeof value !== "string") return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value.startsWith("watch?") ? `https://youtube.com/${value}` : value);
    if (!["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname)) return null;
    const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v");
    return /^[A-Za-z0-9_-]{11}$/.test(id || "") ? id : null;
  } catch { return null; }
}

module.exports = { youtubeId };
