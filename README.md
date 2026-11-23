# GitHub Issues Time Tracker

A Chrome extension to help you stay focused on one issue at a time and easily track the time you invest in each one — directly from your **GitHub Projects board**, no external tools, no context switching.

![Screenshot](docs/screenshot.png)

---

## Features

### ▶ Per-card timer

Every card on your GitHub Projects board gets a small timer widget at the bottom. Click the play button to start focusing, click pause to stop. Simple as that.

- **Grey** — no time recorded yet
- **Green** — time recorded, timer stopped
- **Indigo** — timer is currently running

Only one timer can be active at a time. Starting a new one automatically pauses the previous.

A short sound plays when the timer starts and when it stops.

---

### 📋 Session history

Tracked time is stored as individual sessions (start + end timestamp), not just a total. Hover over a card widget and click the **☰** icon to see a breakdown of all sessions:

- Start and end time for each session
- Duration per session
- Active session shown as "ongoing"
- Sessions ordered from most to least recent

---

### 🟣 Floating bar

While a timer is running, a pill-shaped bar appears at the top center of the page showing:

- **FOCUSING** label
- The issue title
- Live elapsed time
- A **pause button** to stop the timer
- A **⧉ button** to open the Picture-in-Picture window

The browser tab title also updates in real time:

```
5m 30s — Fix login redirect
```

The original title is restored when the timer stops.

---

### 🖥 Picture-in-Picture window

Click **⧉** in the floating bar to open an always-on-top mini window that floats above everything — even other apps. The extension requests a full-width, low-height window, but Chrome may limit its dimensions.

- Shows a slow-pulsing dot + live timer
- Shows the issue title and a pause/resume button
- Displays a proportional daily timeline with colored work intervals, dark breaks, and a white current-time marker; the percentage counts only scheduled work hours
- Optionally shows a second focus-goal bar with a percentage aligned with the day's percentage; hover for focus hours, the daily target, and time ahead of or behind the expected pace
- Closes when the timer is stopped unless **Keep PiP open while the timer is paused** is enabled

> Requires Chrome 116+ and must be opened via a direct click (browser security requirement).

---

### 🔔 Extension badge

The extension icon in the Chrome toolbar shows a live badge with the elapsed time while a timer is running. Useful when GitHub is in a background tab.

---

### ⏹ Extension popup

Click the extension icon in the toolbar to open a compact popup. It has two sections:

**Active timer row** — visible only when a timer is running:
- Pulsing dot + issue title + live elapsed time
- A **stop button** to end the session

**Daily history** — always visible below the timer row:
- Lists every issue worked on that day, grouped by issue, ordered from most to least recent
- Each group shows the issue title, total time for the day, and individual session ranges (e.g. `09:15 – 10:45`) with their duration
- A **total focus time** for the day is displayed in the header
- Use the **‹ ›** arrows to navigate to previous or future days

If no timer is running, the top row simply shows a muted indicator.

Open **Settings** from the popup to configure PiP, your daily focus goal, reminders, and work hours.

---

### ⚙ Settings

Settings open in a separate tab and save automatically. The sections follow this order:

#### Picture-in-Picture

Enable **Open PiP automatically when starting a timer** to open PiP when clicking a card's play button, without using the floating bar button.

Enable **Keep PiP open while the timer is paused** to keep both progress bars updating without recording focus time. PiP displays "Paused" and a play button to resume the last issue; starting another issue updates the same window. If paused and behind an enabled focus goal during scheduled work hours, the entire background pulses amber on a 2-second cycle, along with the dot and focus percentage. There are no reminders while focusing, during breaks, or outside work hours. Reduced-motion preferences disable the animations and keep the reminder background a steady amber instead.

Both PiP options are off by default. Keeping PiP open does not automatically reopen it after you close it manually.

#### Daily focus goal

Enable **Show focus goal progress in PiP** to compare today's focus with a single daily goal (4 hours by default, configurable and the same every day). All recorded focus across issues counts, including time outside work hours; sessions crossing midnight contribute only their portion within today.

A second thin bar shows goal completion as a percentage and a white expected-pace marker. While focusing, the bar and percentage stay green, even when behind. Two clearly visible light-green sweeps move to the right in a 3-second cycle, following the motion of [CSS Loaders' progress example 16](https://css-loaders.com/progress/#l16). Reduced-motion preferences disable the animation. When paused, green means on pace or ahead, amber means behind, and a neutral color means there is no schedule to compare against. The animation stays inside the filled portion and never changes the actual percentage or expected-pace marker.

The focus percentage shows two decimal places, for example `25.01%`, and refreshes every second. Rounding may leave the displayed value unchanged on consecutive refreshes. The digits reflect recorded focus time, not simulated progress; pausing stops the increase. The day percentage stays rounded to whole numbers and counts only elapsed scheduled work time, excluding schedule gaps; pausing the focus timer does not stop day progress.

Hover over the focus bar or percentage for focus hours, the goal, and the pace difference, including while focusing. For example, halfway through an 8-hour scheduled day, a 4-hour focus goal expects 2 hours of focus. Breaks pause the expected pace.

On days without work hours, goal progress still appears, without a pace comparison. The feature is off by default and updates in an already-open PiP when settings change.

#### Focus reminders

Enable **Play a focus reminder sound** for a prominent alert: two bursts of three alternating tones, lasting about 1.6 seconds in total. The reminder uses a louder, brighter tone than the timer's start/stop sounds to help it stand out over other audio; actual audibility depends on your device volume and other media. Sound is off by default and requires all of the following: PiP is open, the timer is paused, an enabled focus goal is behind the expected pace, and the current time falls within a scheduled work interval.

Set **Minutes between sound reminders** to any whole number of minutes of at least 1; the default is **1 minute**. The first chime comes after that interval under qualifying conditions, then repeats at approximately the same cadence without accumulating missed reminders. Changing the interval in an open PiP restarts the wait with the new value. Resuming focus, getting back on pace, disabling sound, or entering a break also resets the wait. Closing PiP stops its reminders. Browser throttling or computer sleep may delay sounds.

#### Work schedule

Set local work intervals for each day to show daily progress in PiP. Each day can have different hours and multiple intervals for breaks; schedules can be copied between days. Intervals cannot cross midnight: split overnight hours between the two days.

PiP shows work intervals in color and breaks in dark. Gaps pause the percentage while the current-time marker continues across the break. This progress tracks the planned day, not time spent focusing. Days without a schedule have no day progress bar.

The weekly scheduled-hour total appears above the daily editors, and each day shows its own total. Totals update as you edit and exclude gaps.

---

### 🎉 Celebration

Hover over any card widget that has tracked time to reveal a **🎉** button. Click it to fire a confetti burst and a short fanfare — a small reward for getting the work done.

---

## Installation

This extension is not published to the Chrome Web Store yet. Install it manually in developer mode:

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the root folder of this repository

---

## How time is stored

Time is saved in `localStorage` under keys prefixed with `gitt:` followed by the card's internal GitHub board ID.

Each entry stores an array of sessions:

```json
{
  "issueRef": "owner/repo/issues/42",
  "issueTitle": "Fix login redirect",
  "sessions": [
    { "start": 1748000000000, "end": 1748003600000 },
    { "start": 1748010000000, "end": null }
  ]
}
```

- `end: null` means the session is currently active
- `issueTitle` is saved the first time you press play on a card, so the popup history can display it even when the board is not open
- Total time and running state are derived from the sessions array — never stored separately
- Entries are only created when you first press play on a card

> **Note:** data is stored locally in the browser. It is not synced across devices or Chrome profiles.

Extension preferences, including PiP options, the weekly work schedule, the focus goal, and sound reminders, are stored separately in `chrome.storage.local`. They are not synced across devices or Chrome profiles either.

---

## Compatibility

- Chrome 116+ (required for Document Picture-in-Picture API)
- Works on `github.com` project boards (GitHub Projects v2)

---

## Known limitations

- **Local storage only** — session data lives in `localStorage` for the GitHub domain. Clearing browser data will erase all tracked time.
- **One board at a time** — if you have multiple GitHub Projects tabs open, the active timer state may conflict between tabs.
- **GitHub markup dependency** — the extension relies on GitHub's DOM structure. If GitHub updates its Projects UI, some selectors may need updating. The selector tests (see below) will catch breakage early.

---

## Selector tests

The extension relies on specific GitHub DOM selectors. If GitHub changes its markup, these tests will tell you exactly which selector broke and what to fix.

### Setup (required once, and whenever GitHub updates its markup)

1. Open a GitHub Projects board in Chrome
2. Open DevTools → Elements tab
3. Right-click on `<html>` → **Copy** → **Copy outerHTML**
4. Paste the content into `tests/fixtures/board.html`

> `board.html` is git-ignored — it must be generated locally.

### Run

```
npm install
npm test
```

---

## Ideas for the future

- **Timer on issue pages** — inject the widget directly on `/issues/123` pages, not just on the board, for people who work from the issue view
- **Timer on pull requests** — track time spent reviewing PRs on `/pull/123` pages; code review is invisible work worth measuring
- **Meeting timer in the popup** — a dedicated button to track time spent in meetings, separate from issue work, to understand the meeting vs. deep work ratio over time
