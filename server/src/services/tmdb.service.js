require("../config/env");

const axios = require("axios");

if (!process.env.TMDB_TOKEN) {
  throw new Error("TMDB_TOKEN is missing from server/.env");
}

const tmdb = axios.create({
  baseURL: "https://api.themoviedb.org/3",
  timeout: 15000,
  headers: {
    Authorization: `Bearer ${process.env.TMDB_TOKEN}`,
    Accept: "application/json",
  },
});

module.exports = tmdb;
