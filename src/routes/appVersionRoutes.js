const express = require("express");
const router = express.Router();
const { getLatestVersion } = require("../controllers/appVersionController");
const { getPublicAppLinks } = require("../controllers/adminSettingsController");

router.get("/v1/app-latest-version", getLatestVersion);
router.get("/v1/app-links", getPublicAppLinks);

module.exports = router;
