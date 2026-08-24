const mediaService = require("../services/media.service");

exports.getHome = async (req, res, next) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit || "20", 10);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 20;
    res.json(await mediaService.getHome(limit));
  } catch (error) {
    next(error);
  }
};

exports.getDetails = async (req, res, next) => {
  try {
    const titleId = Number.parseInt(req.params.titleId, 10);
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
    const titleId = Number.parseInt(req.params.titleId, 10);
    const seasonNumber = Number.parseInt(req.params.seasonNumber, 10);
    if (!Number.isInteger(titleId) || !Number.isInteger(seasonNumber)) {
      return res.status(400).json({ error: "Invalid title ID or season number" });
    }

    const episodes = await mediaService.getEpisodes(titleId, seasonNumber);
    return res.json(episodes);
  } catch (error) {
    return next(error);
  }
};
