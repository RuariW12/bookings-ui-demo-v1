// Admins are seeded here and checked first. Region is informational
// (which region they own) — admins are global in capability.
const adminIdentities = {
  'rwhalen@strategy.com': { regions: ['CLD-HQ'] },
}


// Manager Approval Identities
const approverIdentities = {
  // HQ Approver Emails
  'vgutierrez@strategy.com': { regions: ['CLD-HQ'] },
  'dsobral@strategy.com':    { regions: ['CLD-HQ'] },
  'rzuniga@strategy.com':    { regions: ['CLD-HQ'] },

  // EMEA Approver Emails
  'ohatipoglu@strategy.com':    { regions: ['CLD-EMEA'] },
  'fkaras@strategy.com':        { regions: ['CLD-EMEA'] },
  'xmendizabal@strategy.com':   { regions: ['CLD-EMEA'] },
  'dpapucki@strategy.com':      { regions: ['CLD-EMEA'] },
  'pupadhyay@strategy.com':     { regions: ['CLD-EMEA'] },
  'bwus@strategy.com':          { regions: ['CLD-EMEA'] },
  'zijain@strategy.com':        { regions: ['CLD-EMEA'] },
  'qmiyawara@microstrategy.com':{ regions: ['CLD-EMEA'] },
  'dkumar@microstrategy.com':   { regions: ['CLD-EMEA'] },

  // CTC Approver Emails
  'hguan@strategy.com':         { regions: ['CLD-CTC'] },
  'tzhou@strategy.com':         { regions: ['CLD-CTC'] },
  'zshen@strategy.com':         { regions: ['CLD-CTC'] },
  'tefzhou@strategy.com':       { regions: ['CLD-CTC'] },


// Temporary demo credentials
  // 'rwhalen@strategy.com':       { regions: ['CLD-HQ', 'CLD-CTC', 'CLD-EMEA'] },
};



// CSM Requester Identities
const requesterIdentities = {
  // -- Anibal Sampalione --
  'kalterleib@microstrategy.com':      {},
  'zsastre@microstrategy.com':         {},
  'gfidalgo@microstrategy.com':        {},
  'cguglialmelli@microstrategy.com':   {},
  'ymartino@microstrategy.com':        {},
  'sdgarcia@microstrategy.com':        {},

  // -- David Underwood --
  'dnagelschmitz@microstrategy.com':   {},
  'wvanchenko@microstrategy.com':      {},
  'jrielau@microstrategy.com':         {},
  'qmarchal@microstrategy.com':        {},
  'tcruz@microstrategy.com':           {},
  'ssolignac@microstrategy.com':       {},
  'ppaschoud@microstrategy.com':       {},

  // -- Francesca Laurie --
  'gpisonero@microstrategy.com':       {},
  'rhlee@microstrategy.com':           {},
  'mvadgama@microstrategy.com':        {},
  'jrausell@strategy.com':             {},
  'esakamoto@microstrategy.com':       {},
  'iasingh@microstrategy.com':         {},
  'xlacuna@microstrategy.com':         {},

  // -- Jane Hall --
  'sscaggs@microstrategy.com':         {},
  'clam@microstrategy.com':            {},
  'lgerontiev@microstrategy.com':      {},
  'fstout@microstrategy.com':          {},
  'ybanos@microstrategy.com':          {},
  'bnogalpoziombka@microstrategy.com': {},
  'dogrady@microstrategy.com':         {},
  'sforth@microstrategy.com':          {},

  // -- Neeraj Bindra --
  'rharouaka@microstrategy.com':       {},
  'yskees@microstrategy.com':         {},
  'pheagerty@microstrategy.com':      {},
  'mpullis@microstrategy.com':        {},
  'jpayne@microstrategy.com':         {},

  // -- Zeena Husayni --
  'zsampalione@microstrategy.com':     {},
  'ysegal@microstrategy.com':          {},
  'umiekisz@microstrategy.com':        {},
  'dkirzner@microstrategy.com':        {},
  'qneslin@microstrategy.com':         {},

  // -- Sunil Vadgama --
  'ekaushal@microstrategy.com':        {},
  'stidke@microstrategy.com':          {},
  'pnaik@microstrategy.com':           {},
  'nlambat@microstrategy.com':         {},
  'tveer@microstrategy.com':           {},

  // -- Veronica Solignac --
  'fcolin@microstrategy.com':          {},
  'ybhagat@microstrategy.com':         {},
  'efaulknerjones@microstrategy.com':  {},
  'nburns@microstrategy.com':          {},

  // -- More teams --
  'nupadhyay@microstrategy.com':       {},

  // -- Internal --
  'xtmoperations@strategyInternal.com':{},

  // -- Other CSMs --
  'tiyamamoto@microstrategy.com':      {},
  'cbahia@microstrategy.com':         {},


};



// Lookup functions for auth.jsx
export function resolveUser(email) {
  const key = email.toLowerCase()
  if (adminIdentities[key]) {
    return { role: 'admin', regions: adminIdentities[key].regions }
  }
  if (approverIdentities[key]) {
    return { role: 'approver', regions: approverIdentities[key].regions }
  }
  if (requesterIdentities[key]) {
    return { role: 'requester', regions: [] }
  }
  return null
}

export function canApproveRegion(email, region) {
  const user = resolveUser(email);
  if (!user) return false;
  // Admins are region-scoped super-approvers; approvers are region-scoped.
  // '*' means all regions. Mirrors the backend guard.
  if (user.role !== 'approver' && user.role !== 'admin') return false;
  return user.regions.includes('*') || user.regions.includes(region);
}

// which approvers get notified for a bookings region
export function approversForRegion(region) {
  return Object.entries(approverIdentities)
    .filter(([, v]) => v.regions.includes('*') || v.regions.includes(region))
    .map(([email]) => email)
}