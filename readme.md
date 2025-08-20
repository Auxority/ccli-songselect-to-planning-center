# CCLI SongSelect to Planning Center integration

A browser extension to simplify the process of importing songs from CCLI SongSelect to Planning Center, including ChordPro, lead sheets, and vocal sheets.

*Note that this browser extension **requires** an active PlanningCenter and CCLI SongSelect subscription.*

## Usage

1. Install the browser extension (CCLI SongSelect to Planning Center) [here](https://addons.mozilla.org/en-US/firefox/)
2. Navigate to a SongSelect song page
3. Click on the extension icon and select "Import current song"
4. Follow the steps provided to you by the browser extension.

## The problem

PlanningCenter does not import ChordPro files automatically. Adding editable songs is a 24-step process, which is too complicated for most people.

## The goal

This project aims to automate the 24-step process through a userscript.

## TODO:

1. Check if a song exists within the archived songs in Planning Center (to prevent issues when adding the song)
2. Extract the tempo/bpm from the chords page or lead sheet page (through the CCLI API).
3. Support importing songs without ChordPro

## Development guide

1. Run `npm install` to install the required dependencies.
2. Run `node .` to bundle everything together.
3. Find the (ZIP) files you need for Firefox or Chrome in `./dist/`
