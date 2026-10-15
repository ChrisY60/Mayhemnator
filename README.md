# Mayhemnator

A browser companion for ARAM: Mayhem. Manual entry, no League client integration.

## Run locally

Requires Node.js 20+; the app itself has no runtime dependencies.

```sh
npm start
```

Open http://localhost:5173. Serve `dist/` on any static web host to deploy.

## Features

- Select five allies and up to ten bench options; lock picks and compare the best five lineups.
- Scan a champ select screenshot (upload, drag and drop, or paste) to fill your team and bench. Free and local: champion icons are matched in your browser against Riot Data Dragon icons, and the screenshot never leaves your device. Matches are shown on a preview so you can correct mistakes.
- Rank compositions by individual win-rate mean or an explained synergy score.
- Compare three offered augments for any champion, track up to eight owned augments, and include observed two-augment combinations.
- Enter enemies for limited, explicit contextual adjustments and situational item priorities.
- Search and filter all champions by Riot class and sort by win rate, popularity, or name.
- Session state stays in browser local storage; reset clears it. Changing your played champion clears owned and offered augments.

## Data and interpretation

`dist/data.json` contains a dated public snapshot from https://mayhemmeta.com/, with champion classes from Riot Data Dragon. The UI displays the snapshot date and patch and links to original champion pages. It is not a live feed. Source parsing depends on public page structure and may require maintenance. The source's best/worst teammate tables are partial, not a full matchup matrix.

Mean individual champion win rates are **not team win probabilities**. Synergy scores add approximate class coverage and sample-adjusted observed teammate lifts. Augment ranking uses a 200-game prior at the champion baseline; combinations use approximate counts inferred from rounded pick rates and have bounded influence. Item scores combine sample-adjusted outcomes and popularity; a few labeled contextual rules adjust priority. These are observational recommendations, not causally proven optimal decisions. Builds are priority shortlists, not measured item sequences. See “How it works” and `dist/engine.js` for formulas.

No API key or personal match data is required. Champion and item images originate from Mayhem Meta; all League of Legends game assets belong to Riot Games. This project is independent of both.

## Refresh statistics

```sh
python -m pip install -r requirements.txt
python scripts/refresh_data.py
```

The refresh requests public champion pages with two concurrent workers, records failures, and atomically replaces the snapshot. Inspect its reported failures and rerun tests before deployment. No scheduled background refresh is configured.

## Validation

```sh
npm test
```

Tests cover full-pool optimization, locked picks, duplicate inputs, unavailable augment data, sample shrinkage, owned-augment combo scoring, and incompatible item groups.
