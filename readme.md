# CCLI SongSelect to Planning Center integration

*Note that this userscript **requires** an active PlanningCenter and CCLI SongSelect subscription.*

## Usage

*Note that this might not work in Google Chrome due to Manifest V3*

1. Install the [Violentmonkey](https://violentmonkey.github.io/get-it/) extension.
2. Install the [userscript](https://github.com/Auxority/ccli-chordpro-to-planning-center/raw/refs/heads/main/index.user.js)

## The problem

PlanningCenter does not import ChordPro files automatically. Adding editable songs is a 24-step process, which is too complicated for most people.

## The goal

This project aims to automate the 24-step process through a userscript.

## TODO:

1. Check if a song exists within the archived songs in Planning Center (to prevent issues when adding the song)
2. Automatically add choir sheets to the arrangement if these exist.
3. Extract the tempo/bpm from the chords page or lead sheet page (through the CCLI API).
