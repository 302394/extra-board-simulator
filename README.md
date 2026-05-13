# Extra Board Simulator Web App v11

Run:

```bash
npm install
npm run dev
```

v11 changes:
- Regular jobs are now modeled as full turns:
  - PSC 27/28
  - WEN 7/8
  - WFH 8/7
- A person working the outbound is also tied to the return trip that gets them home.
- Actual Return Tie-Up Adjustments now edit the full turn return tie-up, not a fake one-way job.
- Includes mobile summary buttons, summary zoom controls, and fullscreen summary view.
