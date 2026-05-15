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


## v21 note

Daily board visibility cleanup:
- Starting/Ending Board Order now treats the day as the usable board for that calendar day.
- If someone becomes available later the same day, they stay in board order with an availability note.
- Example: Dave marks up Friday 00:01, so Friday shows Dave in board order with "available Friday 00:01" instead of hiding him under Unavailable.
- Active assignments, block, relief, and vacation still show in their separate status sections.


## v22 note

Same-day board order status cleanup:
- If someone becomes available anytime on the same calendar day, they stay in that day's board order.
- The availability/status note now appears next to their name in board order.
- Example: Dave — VAC; available Friday 00:01.
- Example: Terry — WORKING WEN 7/8 for Chris; available Friday 09:07.
- Unavailable section is now only for people not returning until a later day or truly unavailable.


## v23 note

Full-day board order rule:
- If a person becomes available at any time during the calendar day, they stay in that day's board order.
- Status appears next to their name, e.g. VAC, WORKING, BLOCK, RELIEF, or HOLD-DOWN.
- Unavailable section is only for people who do not return until a later day or are otherwise unavailable.
- Example Friday board:
  1. Dave — VAC; available Friday 00:01
  2. Terry — WORKING WEN 7/8 for Chris; available Friday 09:07
  3. Jayden — WORKING PIN-UP Yard Switching; available Friday 11:30


## v24 note

Uniform board status display:
- Board Order now includes anyone available now or later that same day.
- Board Order only shows name + available time note.
- Job/status reasons now live under Unavailable / Unavailable.
- People unavailable only until later that same day do not get placed under Unavailable / Unavailable.
- Applies consistently across every day and the final end-of-week board order.


## v25 note

Unavailable label cleanup:
- Removed "Unavailable" wording because that can mean a different formal railroad status.
- Section now reads simply "Unavailable:"
- Reasons under that section use WORKING, VAC, RELIEF, BLOCK, or HOLD-DOWN.


## v26 note

Terminology cleanup:
- Removed every remaining "Unavailable" label/string.
- The status section now uses only "Unavailable:" because "unavailable" has a formal railroad meaning.


## v27 note

Run button fix:
- Fixed stale final-summary references that could crash the Run button.
- Final End-of-Week Board Order now reads the current `unavailableReasons` bucket.
- Confirmed the header wording remains `Unavailable:` with no "Out of Service" wording.


## v28 note

Hold-down board display fix:
- HOLD-DOWN now always removes that employee from the extra board.
- A relief-day markup or same-day availability note no longer puts someone back on board while they are holding down.
- Example: Billy holding down Kevin stays under Unavailable as HOLD-DOWN for Kevin, not in Friday board order.


## v29 note

Manual double-out override behavior:
- Manual Double-Out / Rest Override is now a force assignment.
- It can replace the normal board assignment even when the job is not unfilled.
- This lets the simulator model small-base exceptions where a specific employee doubles through even though the board had another legal assignment available.
- The forced assignment is still labeled DOUBLE-OUT / REST OVERRIDE in tiles and summary.


## v30 note

Canceled / Created Trains:
- Added manual cancellation section for train/turn removal.
- Added manual created train/movement section for extra sets, turned trains, and irregular operations.
- Cancellations remove matching generated jobs from assignment logic and show in the summary.
- Created trains become manual jobs protected by the extra board.
- No pin-up is created automatically; users still add pin-ups manually when needed.


## v31 note

Deadhead created-job support:
- Created Train / Manual Movement now has Movement Type.
- Added Deadhead home only and Deadhead out + return train.
- Deadhead jobs still behave like manual created jobs for board/rest logic.
- Labels now show DHE from/to information.
- Pin-ups are still not auto-created.


## v32 note

Wide desktop/tablet layout:
- Increased max desktop width.
- Wider screens now give more room to the Vacancies / Jobs and Simulation Summary columns.
- Mobile breakpoint is unchanged, so phone layout should stay the same.
- Run still rebuilds planned simulation from setup inputs.
- Recalculate Actual Board still rebuilds from generated job tiles plus actual tie-up edits/overrides.


## v33 note

Desktop/tablet input-column layout:
- On larger screens, the Vacancies / Jobs card now splits input sections into two columns.
- This reduces scrolling for desktop/tablet users.
- Mobile remains one column and should behave the same as before.
- Logic was not changed in this patch.


## v34 note

Desktop/tablet layout experiment:
- Setup and Vacancies / Jobs sit side-by-side on wider screens.
- Live Board Replay / Actual Tie-Ups and Simulation Summary move below and span the full width.
- Each input sub-box keeps full container width instead of being split into skinny columns.
- Mobile layout remains one column.
- Logic was not changed in this patch.


## v35 note

Balanced desktop Vacancies / Jobs layout:
- Keeps v34's desktop concept: Setup and Vacancies / Jobs on top, results below full width.
- On wider screens, Vacancies / Jobs now uses two internal columns to reduce scrolling.
- Sub-boxes stretch evenly within their grid row so paired sections feel more balanced.
- Mobile layout remains unchanged.
- No board logic changed.


## v36 note

Desktop card-wall layout experiment:
- On wide desktops, Setup and Vacancies / Jobs sub-boxes flow as a card wall.
- Vacancy/job boxes can continue under the Setup section instead of being locked only to the right column.
- Live Board Replay / Summary stays full width below the inputs.
- Mobile layout is unchanged.
- No board logic changed.


## v37 note

Manual job / DHE and hold-down return improvements:
- Renamed created-job section to Add Manual Job / Deadhead.
- Job type labels are now: Add return train, DHE home only, DHE out + work return train, and Other manual job.
- Added default away-terminal times:
  - PSC 27 away tie-up: 06:44
  - WEN 7 away tie-up: 06:50
  - WFH 8 away tie-up: 07:21
- Added tie-up location for manual jobs, with warning text if someone ties up away from SPK.
- Added manual hold-down markup day/time and a continues-through-week option.
- DHE out + return train still behaves like a normal board job for call/rest purposes.


## v38 note

Simplified DHE workflow:
- Removed the separate Add Manual Job / Deadhead UI section.
- Renamed Pin-Up / Extra Job to Extra Job / DHE.
- Added Job type: Pin-up / extra job or DHE to protect turn.
- DHE entries modify matching open regular vacancies for the same day/route instead of creating a confusing separate manual job.
- DHE replaces the outbound side of the turn; the return train and normal return-on-duty logic remain tied to the selected route.
- Canceled Trains remains its own section.


## v39 note

Extra Job / DHE conditional UI:
- Pin-up / extra job now only shows pin-up fields.
- DHE to protect turn now only shows DHE fields.
- This is UI cleanup only; DHE board logic from v38 is unchanged.


## v40 note

Away terminal actual off-duty edits:
- Live Board Replay tiles now show editable away-terminal off-duty time for complete turns / DHE turns.
- Return tie-up remains editable below it.
- If the away-terminal off-duty edit leaves less than 8 hours before the return on-duty time, the tile shows a warning.
- Recalculate Actual Board carries that warning into the summary so the user knows to create a DHE/replacement.


## v41 note

DHE creates board jobs when needed:
- DHE no longer requires a matching open vacancy to exist.
- If a matching day/route vacancy exists, DHE modifies it.
- If no matching vacancy exists, DHE creates a standalone extra-board DHE job and assigns it through normal board order.
- Removed the return tie-up input from the DHE menu.
- DHE return tie-up now uses the normal return train time automatically:
  - PSC 28: 00:47
  - WEN 8: 01:07
  - WFH 7: 03:19


## v42 note

Collapsible Vacancies / Jobs UI:
- Each Vacancies / Jobs subsection is now expandable/collapsible.
- Section headers show entry counts where applicable.
- Most-used sections start open; less-used sections start collapsed.
- Board logic is unchanged from v41.


## v43 note

Collapsible Setup UI:
- Setup now has collapsible Starting Board and Relief / Markup sections.
- Relief / Markup cards were cleaned up so the name and relief day do not run together.
- Board logic is unchanged from v42.


## v44 note

Default-collapsed menus:
- Setup and Vacancies / Jobs collapsible sections now start collapsed on fresh load.
- Users can expand only the section they need.
- Board logic is unchanged from v43.


## v45 note

Hold-down return availability fix:
- Manual hold-down markup now fully returns the employee to the extra board at that time.
- A returned hold-down employee can take later jobs the same day, such as a Sunday pin-up.
- A returned hold-down employee no longer remains listed as unavailable / HOLD-DOWN after their manual markup time.
- Board logic otherwise remains unchanged from v44.


## v46 note

Fixed desktop columns:
- Desktop layout now keeps Setup locked in the left column.
- Vacancies / Jobs stays in its own right column.
- Live Board Replay / Actual Tie-Ups stays below both columns.
- Mobile layout still stacks normally.
- Board logic is unchanged from v45.
