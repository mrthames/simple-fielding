# App Store listing (Simple Fielding)

The Apple counterpart to `store/play/listing.md`, kept in step with it. Paste into App Store Connect
(app 6817473927). The listing is for coaches and parents, who hand the app to their players: never "for kids"
or "for children" outside Apple's Kids Category, and no "every play" claim.

## App Information (General → App Information)

| Field | Value |
|---|---|
| Name (max 30) | Simple Fielding |
| Subtitle (max 30) | Youth baseball defense trainer |
| Primary category | Sports |
| Secondary category | Education |
| Content rights | No third-party content. |
| Encryption documentation | None: no non-exempt encryption (`usesNonExemptEncryption: false` in `native/app.json`). |
| Age rating | 4+ from the questionnaire. Not in the Kids Category. |

## Version page (iOS App → the version)

**Promotional text (max 170; editable without a new review):**

Show your players where to be on each play, and why: who fields it, who covers, who backs it up. Watch it in 2D or 3D, then quiz them.

**Description (max 4,000):** the full description from `store/play/listing.md`, unchanged.

**Keywords (max 100, commas, no spaces; no trademarks, so not "Little League"):**

baseball,softball,fielding,coach,positions,cutoff,relay,defense,practice,drills,infield,outfield

**Support URL:** https://simplefielding.com

**Marketing URL:** https://simplefielding.com

**Privacy Policy URL:** https://simplefielding.com/privacy/

**Copyright:** 2026 Thames Productions

## Images

| Slot | Folder | Size |
|---|---|---|
| iPad 13" (the lead set: iPad is the main target) | `screenshots-ipad-13/` | 2752 × 2064 |
| iPhone 6.5" | `screenshots-6.5/` | 1284 × 2778 |

Upload 1 to 6 in order. App Store Connect fills the smaller iPhone and iPad sizes from these.
The app icon isn't uploaded: it comes from the build (`native/assets/icon.png`, `icon-dark.png`).

## App Privacy

Data not collected. The store apps send nothing anywhere: tester reporting is off in them
(`window.SF_NATIVE`, held by `tests/native.spec.ts`), and there's no analytics, crash reporting or ads.
