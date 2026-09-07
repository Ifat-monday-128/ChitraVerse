const mediaService = require("../services/media.service");

exports.getHome = async (req, res, next) => {
  try {
    res.json(await mediaService.getHome());
  } catch (error) {
    next(error);
  }
};

exports.browse = async (req, res, next) => {
  try {
    const { type = "all", collection = "all", q = "" } = req.query;
    const limit = Number(req.query.limit ?? 24);
    const offset = Number(req.query.offset ?? 0);
    if (!["all", "movie", "series"].includes(type) || !["all", "hollywood"].includes(collection)
      || typeof q !== "string" || q.length > 120 || !Number.isInteger(limit) || limit < 1 || limit > 100
      || !Number.isInteger(offset) || offset < 0 || offset > 100000) {
      return res.status(400).json({ error: "Invalid search or pagination parameters" });
    }
    res.json(await mediaService.browse({ type, collection, q: q.trim(), limit, offset }));
  } catch (error) { next(error); }
};

exports.getDetails = async (req, res, next) => {
  try {
    const titleId = Number(req.params.titleId);
    if (!Number.isInteger(titleId) || titleId < 1) {
      return res.status(400).json({ error: "Invalid title ID" });
    }

    const media = await mediaService.getDetails(titleId);
    if (!media) return res.status(404).json({ error: "Media not found" });
    return res.json(media);
  } catch (error) {
    return next(error);
  }
};

exports.getEpisodes = async (req, res, next) => {
  try {
    const titleId = Number(req.params.titleId);
    const seasonNumber = Number(req.params.seasonNumber);
    if (!Number.isInteger(titleId) || titleId < 1 || !Number.isInteger(seasonNumber) || seasonNumber < 0) {
      return res.status(400).json({ error: "Invalid title ID or season number" });
    }

    const episodes = await mediaService.getEpisodes(titleId, seasonNumber);
    return res.json(episodes);
  } catch (error) {
    return next(error);
  }
};
