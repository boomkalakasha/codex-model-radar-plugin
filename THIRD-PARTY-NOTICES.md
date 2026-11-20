# Credits and third-party scope

**数据署名：数据来自 Codex 雷达 [codexradar.com](https://codexradar.com/)。💗**

Codex Radar data and methodology are external material, not licensed by this
repository's Apache-2.0 grant. The plugin fetches the public publication at
runtime and links back to its source. Parser tests contain invented data,
not a copy of the site's page or dataset.

`docs/images/model-radar-preview.png` is the exact screenshot supplied by the
project owner for publication in the README on 2026-11-20. It is documentation
evidence, not a benchmark dataset. Its original PNG has only IHDR, IDAT and
IEND chunks. Third-party interface elements, names and displayed source data
remain with their respective rights holders. See
[the screenshot notice](LICENSES/LicenseRef-Documentation-Screenshot.txt).

The BOOMKALAKASHA wordmark is reused without modification from the owner's
[AI-first Vibe Coding project](https://github.com/boomkalakasha/ai-first-vibe-coding-skill/blob/main/assets/brand/watermark-auto.svg),
distributed there under Apache-2.0. It can be replaced by editing the image
links in both READMEs; it does not establish third-party endorsement.

The MCP SDK, MCP Apps SDK, Cheerio, Zod, Lucide and their bundled dependencies
retain their upstream licenses. The build collects the license texts of the
actual bundled packages into `plugin/dist/THIRD-PARTY-NOTICES.txt` for the
prebuilt release. `package-lock.json` fixes dependency versions and integrity.
The `boolbase@1.0.0` npm archive omits its license file; the build uses
`LICENSES/ISC.txt`, copied from [its upstream license](https://github.com/fb55/boolbase/blob/master/LICENSE).

Codex and other model/product names identify compatibility or source data.
This repository is independent of OpenAI and Codex Radar.
