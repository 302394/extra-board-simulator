# Extra Board Simulator Web App v12 Board Replay Beta

Run:

```bash
npm install
npm run dev
```

v12 beta changes:
- Keeps the v11 full-turn model: PSC 27/28, WEN 7/8, WFH 8/7.
- Shows UNFILLED jobs with skip reasons when nobody is available/rested.
- Adds manual DOUBLE-OUT / REST OVERRIDE.
- Adds Block Training for regulars and extra-board employees.
- Actual tie-up cards reorder by edited actual tie-up time after recalculation.

Note: This is a beta patch. The full actual-board replay/ripple engine is partially implemented; test scenarios before relying on it.


## v13 note

Fixes actual tie-up ordering and adjusted-board replay:
- Sunday jobs tying up Monday now sort after Sunday, not at the top of the week.
- Actual edited tie-up times are parsed relative to the job that created them.
- Recalculate Actual Board now rebuilds the adjusted simulation using edited return times.
- A late return into a relief day should block the employee until the actual 24-hour markup time unless "May start job on relief day" is checked.
- After an UNFILLED message, add a Manual Double-Out / Rest Override and press Recalculate Actual Board to rebuild the adjusted summary with the forced assignment.


## v14 note

Simplifies summary behavior:
- Removed the separate Adjusted Summary block.
- Recalculate Actual Board now rewrites the main Simulation Summary.
- Summary mode shows Planned or Actual / Adjusted Board Replay.
- Save Summary downloads whichever summary is currently shown.
- Fullscreen summary opens the current summary only.


## v15 note

Improves the Actual Return Tie-Up tile panel:
- UNFILLED jobs now stay visible as tiles instead of disappearing.
- UNFILLED tiles show the skip reasons and prompt the user to add a Manual Double-Out / Rest Override.
- Double-out override assignments now show as DOUBLE-OUT tiles after Recalculate Actual Board.
- Tile panel, summary, and board replay now stay visually aligned.


## v16 note

Block Training now applies an 8-hour rest buffer:
- If someone marks up from block training at 23:00, they are not available until 07:00.
- Regular jobs starting before block-training markup + 8 hours become vacant.
- Extra-board employees return to the board at block-training markup + 8 hours.
- Skip reasons now show block training/rest availability time.


## v17 note

Block Training now has a start time and checks rest before block:
- Default block start time is 08:00.
- Employees need 8h rest before block starts.
- A job assignment is skipped if its return tie-up leaves less than 8h before block start.
- Employees still need 8h rest after block markup before returning to work.


## v18 note

Board replay cleanup:
- Actual tie-up card edits are saved in localStorage.
- Actual tie-up section renamed to Live Board Replay / Actual Tie-Ups.
- Ending Board Order now only shows people currently available on the board.
- People not back yet appear under Unavailable / Resting / Out on Assignment.
- Adds Weekly Vacancy / Absence Summary near the top of the report.
- Adds Final End-of-Week Board Order at the bottom of the report.


## v19 note

Unavailable status labels:
- Unavailable / Resting / Out on Assignment now shows WHY someone is unavailable.
- Working assignments show as WORKING plus the turn/job.
- Vacation shows VAC.
- Block training shows BLOCK.
- Relief shows RELIEF.
- Hold-downs show HOLD-DOWN.


## v20 note

Board order/status fix:
- Working assignment labels now expire at the return tie-up/markup time.
- After someone ties up and marks up from a job, they show back in board order with an availability note if still resting.
- Example: Jayden ties up Tuesday 00:47 and is rested Tuesday 08:47, so Tuesday starting board shows Jayden — available Tuesday 08:47 instead of hiding him under Out on Assignment.
