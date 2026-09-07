const express = require("express");
const mediaController = require("../controllers/media.controller");

const router = express.Router();

router.get("/", mediaController.browse);
router.get("/home", mediaController.getHome);
router.get("/search", mediaController.browse);
router.get("/:titleId", mediaController.getDetails);
router.get("/:titleId/seasons/:seasonNumber/episodes", mediaController.getEpisodes);

module.exports = router;
