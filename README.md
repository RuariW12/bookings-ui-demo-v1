# Parallel Build Scheduling Tool

A React app for scheduling Parallel Build (container migration) work: environment builds, MD refreshes,
and cutovers for the CSM and CLS Team

## What it does

- **Booking form** — pick an operation type, the operating team, an environment, and a
  date/time. Validates lead time and slot availability before submitting.
- **Schedule** — a Float-style timeline showing all bookings by team, with per-team build
  capacity and an edit modal.

## What it replaces

**The old manual workflow:**  CSM's book with customer and report into Microsoft Teams with CLS to find best available times. Once a consensus is found, CSM's go and book into float which is then approved by a CLS manager. 
**The new workflow:** Similar to the OCU booking process, a CSM books the available date through a scheduling UI. Can automatically find optimal times, and the approval process is consolidated into the app. Once booked, on the same page can find the global calendar which replaces the float UI and adds further integration/configurability. 

## Framework

- React + Vite (JavaScript)
- Mock data in `bookings.js` (the running demo reads this in memory there is no database yet)

## Running locally

```bash
npm install
npm run dev      # dev server
npm run build    # static build → dist/
```

`VITE_FLOW_URL` points the booking form at the Power Automate flow. Without it, the form
just logs the payload to the console.



# to add
- login, when logged in it autofills csm address and name
- approval tab. CSM's can check the request of approval and other managers can approve frmo there. This removes the power automate approval workflow, and centralizes the approval process. Roles will have to be delegated as to approvers and request to approvers. 