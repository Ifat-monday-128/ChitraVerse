# Awards collection

The Awards navigation tab opens a public catalog with title, award, category, type and year filters. Title detail pages also show their stored awards.

The checked-in `server/database/data/awards.json` contains 1,500 dated award records for 100 movies and 100 series from the existing catalog. Data comes from Wikidata's CC0 structured data. Each record links to the source entity revision used during collection. The dataset also preserves award entity links and reference URLs where provided by Wikidata.

Collection matches movie TMDB IDs (P4947) and television TMDB IDs (P4983), separately. Legacy negative television IDs are matched by absolute value. Only non-deprecated award-received statements (P166) with dated qualifiers (P585) and English award labels are included. Nominations are excluded. Selection favors titles with more dated records; this is selected coverage, not a complete awards history. Records include honors and acting or craft awards associated with a title; they are not a count of unique trophies won by the title itself. Years reflect Wikidata's qualifiers and can differ from a work's release year or eligibility year. Wikidata is community maintained, so individual claims may need checking against their linked references.

## Import on another local installation

Run from the project root, with the existing catalog and server database configuration present:

```sh
npm run migrate
npm --prefix server run awards:import
```

Import resolves local title IDs using TMDB identity and media type. It aborts and rolls back if any title is missing or ambiguous. Repeating it updates source records without duplicating them and preserves other existing awards. Migration 007 adds source metadata and indexes to the existing awards table and widens category text.

To collect a fresh snapshot from Wikidata, run `npm --prefix server run awards:collect`, then review the generated JSON before importing. Collection uses local `.local-data` caches; `--from-cache` reuses them. Collection requires internet access, whereas importing the checked-in dataset does not. Changes to selected titles are additive on import; old records are not automatically deleted.

Sources: [Wikidata licensing](https://www.wikidata.org/wiki/Wikidata:Licensing), [award data model](https://www.wikidata.org/wiki/Wikidata:WikiProject_Award/en).
