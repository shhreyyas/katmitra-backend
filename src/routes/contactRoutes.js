const express = require("express");
const router = express.Router();
const { submitContact } = require("../controllers/contactController");

router.post("/v1/contact-us", submitContact);
router.post("/contact-us", submitContact);

module.exports = router;
