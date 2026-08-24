const express = require("express");
const mediaController = require("../controllers/media.controller");

const router = express.Router();

router.get("/", mediaController.getHome);
router.get("/:titleId", mediaController.getDetails);
router.get("/:titleId/seasons/:seasonNumber/episodes", mediaController.getEpisodes);

module.exports = router;
