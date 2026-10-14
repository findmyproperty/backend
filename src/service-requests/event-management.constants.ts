export const EVENT_MANAGEMENT_SERVICE_KEYS = [
  'decoration',
  'catering', // legacy
  'home_catering',
  'corporate_catering_veg_non_veg',
  'photography',
  'music',
  'hosting',
  'return_gifts',
  'venue_booking',
] as const;

export type EventManagementServiceKey =
  (typeof EVENT_MANAGEMENT_SERVICE_KEYS)[number];
