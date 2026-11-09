// Player names: two words, "Neon Modem", like the other 88x31 games. Names can't be typed (Nov 8, 2026): a new
// player gets a rolled name they can roll again before signing, and a member can reroll theirs. The word lists are
// copied from the master list, dungeon-items src/name-words.js; change them there first. Players named before Nov 8
// keep their typed names (lib/accounts.js nameProblem still knows the old rule for them).
export const ADJECTIVES = [
  "Quiet", "Sleepy", "Misty", "Golden", "Silver", "Glowing", "Lucky", "Little", "Mellow", "Sunny",
  "Drowsy", "Faint", "Distant", "Midnight", "Neon", "Pixel", "Static", "Chrome", "Analog", "Turbo",
  "Hyper", "Mega", "Blinking", "Spinning", "Glitchy", "Fuzzy", "Cosmic", "Lunar", "Electric", "Velvet",
  "Bubble", "Plastic", "Candy", "Laser", "Retro", "Wired", "Offline", "Lagging", "Secret", "Shiny",
];
export const NOUNS = [
  "Modem", "Cursor", "Floppy", "Pager", "Sprite", "Cassette", "Arcade", "Byte", "Beeper", "Satellite",
  "Antenna", "Jukebox", "Robot", "Rocket", "Respawn", "Emoticon", "Cartridge", "Banner", "Marquee", "Joystick",
  "Mixtape", "Webring", "Guestbook", "Keyboard", "Boombox", "Popup", "Inbox", "Desktop", "Bookmark", "Mouse",
  "Icon", "Chip", "Signal", "Radio", "Screen", "Widget", "Cable", "Button", "Gadget", "Console",
];

// Is this exactly one adjective then one noun from the lists?
export function isListName(name) {
  const m = /^([A-Za-z]+) ([A-Za-z]+)$/.exec(String(name || ""));
  return !!m && ADJECTIVES.includes(m[1]) && NOUNS.includes(m[2]);
}

// A random list name nobody has (ignoring case), never `except`; null if a few dozen tries all hit taken names.
export async function freeName(env, except = null, rand = Math.random) {
  for (let i = 0; i < 40; i++) {
    const name = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)] + " " + NOUNS[Math.floor(rand() * NOUNS.length)];
    if (except && name.toLowerCase() === String(except).toLowerCase()) continue;
    if (!(await env.DB.prepare("SELECT 1 FROM users WHERE name = ? COLLATE NOCASE").bind(name).first())) return name;
  }
  return null;
}
