// Ids of the reply buttons we send.
const ACTIONS = {
  CONFIRM: 'CONFIRM_BOOKING',
  RESTART: 'RESTART_BOOKING',
  CANCEL: 'CANCEL_BOOKING',
};

// Row-id prefixes of the date / time menus: "DATE:2026-11-16", "TIME:10:30", "DATES_MORE:9".
const LIST = {
  DATE: 'DATE',
  DATES_MORE: 'DATES_MORE',
  TIME: 'TIME',
  TIMES_MORE: 'TIMES_MORE',
};

module.exports = { ACTIONS, LIST };
