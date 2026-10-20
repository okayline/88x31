// The sky on a given moment, for a copy's marks in the shared registry (lib/registry.js): the moon's phase and the days
// the real sky makes special. Copied from 4Dungeon (daily-dungeon/screen.js v1.33, moonIndex and OCCASIONS), so a button
// made here carries the same night marks as a thing found there (irl-dungeon has the same copy). A fix to the eclipse
// table or the formulas goes in all three.
const QREF = Date.UTC(2000, 0, 6, 18, 14);
export const PHASE_MARK = ["new", "wax_cres", "first_q", "wax_gib", "full", "wan_gib", "last_q", "wan_cres"];   // 4Dungeon's (rules.js)

export function moonIndex(date) {
  const ref = Date.UTC(2000, 0, 6, 18, 14), syn = 29.530588853;
  let age = ((date.getTime() - ref) / 86400000) % syn;
  if (age < 0) age += syn;
  return Math.floor(age / syn * 8 + 0.5) % 8;
}

// OCCASIONS (v1.27): the days the real sky makes special. Each is only a name; things found on such a day carry it as a
// mark. All on the shared UTC calendar and the same mean moon as everything else, so every player gets the same days.
//   blue_moon      the full moon that is the second of its calendar month (the whole full phase around it)
//   supermoon      a full moon within about 360,000 km of the Earth at its peak
//   thirteenth_moon the 13th full moon of a year that has 13 (every two or three years)
//   eclipse_solar, eclipse_lunar   real eclipses (NASA's tables, 2026 to 2040; lunar ones that are only penumbral are left out)
//   equinox, solstice              the day the sun crosses the line
//   mirror_day     the month is the day (1/1 to 12/12)
const SYN = 29.530588853;
const peakAt = k => QREF + (k + 0.5) * SYN * 86400000;                  // the middle of the k-th full moon
const ECLIPSES = {
  solar: "2026-02-17 2026-08-12 2027-02-06 2027-08-02 2028-01-26 2028-07-22 2029-01-14 2029-06-12 2029-07-11 2029-12-05 2030-06-01 2030-11-25 2031-05-21 2031-11-14 2032-05-09 2032-11-03 2033-03-30 2033-09-23 2034-03-20 2034-09-12 2035-03-09 2035-09-02 2036-02-27 2036-07-23 2036-08-21 2037-01-16 2037-07-13 2038-01-05 2038-07-02 2038-12-26 2039-06-21 2039-12-15 2040-05-11 2040-11-04".split(" "),
  lunar: "2026-03-03 2026-08-28 2028-01-12 2028-07-06 2028-12-31 2029-06-26 2029-12-20 2030-06-15 2032-04-25 2032-10-18 2033-04-14 2033-10-08 2034-09-28 2035-08-19 2036-02-11 2036-08-07 2037-01-31 2037-07-27 2039-06-06 2039-11-30 2040-05-26 2040-11-18".split(" "),
};
// The moon's distance at full moon (km), from its anomaly (Meeus' biggest terms, with the sun opposite).
function fullDistance(ms) {
  const d = (ms - Date.UTC(2000, 0, 1, 12)) / 86400000, M = (134.963 + 13.064993 * d) * Math.PI / 180;
  return 385000.56 - 24604.5 * Math.cos(M) - 2956 - 570 * Math.cos(2 * M);
}
// The day (UTC ms) of the equinox or solstice in a year: Meeus' mean formulas, good to the day.
function sunDay(year, i) {
  const Y = (year - 2000) / 1000;
  const jde = [2451623.80984 + 365242.37404 * Y + 0.05169 * Y * Y - 0.00411 * Y ** 3 - 0.00057 * Y ** 4,
    2451716.56767 + 365241.62603 * Y + 0.00325 * Y * Y + 0.00888 * Y ** 3 - 0.0003 * Y ** 4,
    2451810.21715 + 365242.01767 * Y - 0.11575 * Y * Y + 0.00337 * Y ** 3 + 0.00078 * Y ** 4,
    2451900.05952 + 365242.74049 * Y - 0.06223 * Y * Y - 0.00823 * Y ** 3 + 0.00032 * Y ** 4][i];
  return Math.floor(((jde - 2440587.5) * 86400000) / 86400000);       // the UTC day number
}
export function occasions(date) {
  const out = [], t = date.getTime(), day = Math.floor(t / 86400000), dt = new Date(day * 86400000);
  const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, dd = dt.getUTCDate(), iso = dt.toISOString().slice(0, 10);
  if (moonIndex(date) === 4) {
    const k = Math.round((t - QREF) / 86400000 / SYN - 0.5), peak = new Date(peakAt(k)), pm = peak.getUTCFullYear() * 12 + peak.getUTCMonth();
    const before = new Date(peakAt(k - 1)), after = new Date(peakAt(k + 1));
    if (before.getUTCFullYear() * 12 + before.getUTCMonth() === pm) out.push("blue_moon");
    if (fullDistance(peakAt(k)) <= 361500) out.push("supermoon");
    let n = 0, j = k - 1; while (new Date(peakAt(j)).getUTCFullYear() === peak.getUTCFullYear()) { n++; j--; }       // this full moon's place in its year
    let tot = n; j = k; while (new Date(peakAt(j)).getUTCFullYear() === peak.getUTCFullYear()) { tot++; j++; }
    if (tot >= 13 && n === 12) out.push("thirteenth_moon");
    void after;
  }
  if (ECLIPSES.solar.includes(iso)) out.push("eclipse_solar");
  if (ECLIPSES.lunar.includes(iso)) out.push("eclipse_lunar");
  if (day === sunDay(y, 0) || day === sunDay(y, 2)) out.push("equinox");
  if (day === sunDay(y, 1) || day === sunDay(y, 3)) out.push("solstice");
  if (m === dd) out.push("mirror_day");
  return out;
}
