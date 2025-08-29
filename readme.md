# CCLI SongSelect to Planning Center integration

A browser extension to simplify the process of importing songs from CCLI SongSelect to Planning Center, including ChordPro, lead sheets, and vocal sheets.

*Note that this browser extension **requires** an active PlanningCenter and CCLI SongSelect subscription.*

## Usage

1. Install the browser extension
- For [Firefox](https://addons.mozilla.org/en-US/firefox/addon/songselect-to-planning-center/)
- For [Chrome](https://chromewebstore.google.com/detail/ccli-songselect-to-planni/flajcckkgnpmjcpobjekhdjlkalgkipf)
2. Navigate to a SongSelect song page
3. Click on the extension icon and select "Import current song"
4. Follow the steps provided to you by the browser extension.

## The problem

PlanningCenter does not import ChordPro files automatically. Adding editable songs is a 24-step process, which is too complicated for most people.

## The goal

This project aims to automate the 24-step process through a userscript.

## TODO:

1. Filter out (x2), (x3), (x4) and (2x), x2, 2x, etc. from ChordPro.
2. Filter out duplicate empty lines from ChordPro.
3. Filter out (To Chorus) and other references from ChordPro.
4. Add missing square brackets to chords.
5. Check if a song exists within the archived songs in Planning Center (to prevent issues when adding the song)
6. Extract the tempo/bpm from the chords page or lead sheet page (through the CCLI API).
7. Support importing songs without ChordPro

## Development guide

1. Run `npm install` to install the required dependencies.
2. Run `node .` to bundle everything together.
3. Find the (ZIP) files you need for Firefox or Chrome in `./dist/`
