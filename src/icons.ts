const paths = {
  snow: '<path d="M12 2v20M3.34 7l17.32 10m0-10L3.34 17M8.5 4l3.5 3.5L15.5 4m-7 16 3.5-3.5 3.5 3.5M3.3 11.2l4.8-1.3L6.8 5m10.4 14-1.3-4.9 4.8-1.3M17.2 5l-1.3 4.9 4.8 1.3M3.3 12.8l4.8 1.3L6.8 19"/>',
  swords: '<path d="m14.5 17.5 3 3m-6-6 8-8 1-3-3 1-8 8M4 4l1 3 12 12 2-2L7 5 4 4zm3.5 11.5-3 3m3-1 2 2m-5 1 1-1m14-4 2 2m-2.5 2.5 1 1"/>',
  book: '<path d="M12 6.5C9.5 4.5 6.5 4 3 5v13c3.5-1 6.5-.5 9 1.5 2.5-2 5.5-2.5 9-1.5V5c-3.5-1-6.5-.5-9 1.5v13"/>',
  guide: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 1 1 3.3 2.35c-.66.23-.8.8-.8 1.45m0 3h.01"/>',
  audio: '<path d="M3 9h4l5-4v14l-5-4H3zM16 9a4 4 0 0 1 0 6m2.5-8.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M3 9h4l5-4v14l-5-4H3zm13 1 5 5m0-5-5 5"/>',
  settings: '<path d="m10 3-.55 2.3a7.6 7.6 0 0 0-1.65.95L5.5 5.6 3.5 9l1.72 1.62a7.3 7.3 0 0 0 0 1.96L3.5 14.2l2 3.4 2.3-.66a7.6 7.6 0 0 0 1.65.95l.55 2.3h4l.55-2.3a7.6 7.6 0 0 0 1.65-.95l2.3.66 2-3.4-1.72-1.62a7.3 7.3 0 0 0 0-1.96L20.5 9l-2-3.4-2.3.65a7.6 7.6 0 0 0-1.65-.95L14 3z"/><circle cx="12" cy="11.6" r="2.5"/>',
  trophy: '<path d="M8 3h8v6a4 4 0 1 1-8 0zm0 2H4v2a3 3 0 0 0 4 2.8M16 5h4v2a3 3 0 0 1-4 2.8M12 13v5m-4 3h8m-6-3h4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.8 1.8"/>',
  skull: '<path d="M9 20v-3H7a2 2 0 0 1-2-2v-3a7 7 0 0 1 14 0v3a2 2 0 0 1-2 2h-2v3zm3-2v2"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>',
  pause: '<path d="M9 5v14m6-14v14" stroke-width="2.4"/>',
  play: '<path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
  heart: '<path d="M20 5.8a4.5 4.5 0 0 0-6.4 0L12 7.4l-1.6-1.6A4.5 4.5 0 0 0 4 12.2l8 8 8-8a4.5 4.5 0 0 0 0-6.4z" fill="currentColor" stroke="none"/>',
  gem: '<path d="M12 2 5 9l7 13 7-13zM5 9h14m-7-7-2.5 7L12 22l2.5-13z"/>',
  expand: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
  shrink: '<path d="M9 4v5H4m16 0h-5V4m0 16v-5h5M4 15h5v5"/>',
  camera: '<path d="M12 2.8 21 7.3v9.4l-9 4.5-9-4.5V7.3zM3 7.3l9 4.6 9-4.6m-9 4.6v9.3M7.5 5l9 4.6"/>',
  keyboard: '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14.5h10"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 6m-1-6V5m0 5h5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9z"/>',
  chart: '<path d="M3 3v17h18M7 15v-4m5 4V7m5 8V4" stroke-width="2"/>',
  coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6"/><path d="M10 12a2 2 0 1 1 2 2h2"/>',
  quest: '<path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM5 16h14m-9-9h5m-5 4h5"/>',
  magnet: '<path d="M5 5h4v8a3 3 0 0 0 6 0V5h4v8a7 7 0 1 1-14 0zM5 9h4m6 0h4"/>',
  shield: '<path d="M12 2.7 20 6v5.1c0 4.7-3 8-8 10.2-5-2.2-8-5.5-8-10.2V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
  spark: '<path d="M12 2c.5 6 4 9.5 10 10-6 .5-9.5 4-10 10-.5-6-4-9.5-10-10 6-.5 9.5-4 10-10z" fill="currentColor" stroke="none"/>',
  wind: '<path d="M3 8h12a2.5 2.5 0 1 0-2.5-2.5M3 12h16a2 2 0 1 1-2 2m-12 2h7a2.5 2.5 0 1 1-2.5 2.5"/>',
  flame: '<path d="M12 22a8 8 0 0 1-8-8c0-3 2-6 4.5-8-.2 3 .8 4.2 1.8 4.9C13.9 8.4 13.5 5 13 2c4 3.2 7 7.6 7 12a8 8 0 0 1-8 8z"/><path d="M12 21.8a4 4 0 0 1-4-4c0-2 1.5-3.7 3-4.8.4 1.5 1.4 2 2.2 2.2.5-.6.9-1.3 1-2.2a6.8 6.8 0 0 1 1.8 4.8 4 4 0 0 1-4 4z"/>',
} as const;

export type Icon = keyof typeof paths;

export function icon(name: Icon, size = 20) {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

const art = {
  bolt: '<path fill="#3159bd" d="m3 35 11-17 18-9-7 16-10 4z"/><path fill="#81e0ff" d="M9 31 20 14l15-8-8 15-10 3z"/><path fill="#c1f7ff" d="M20 14 35 6l-13 14-5 4z"/><path fill="#4f9efc" d="m22 20 13-14-8 15-10 3z"/><path stroke="#96eaff" stroke-width="1.4" stroke-linecap="round" d="m5 22 8-7m14 15 7-6M6 28l3-3"/><path fill="#d9fcff" d="m10 8 1.3 2.7 2.7 1.3-2.7 1.3L10 16l-1.3-2.7L6 12l2.7-1.3z"/>',
  nova: '<circle cx="20" cy="20" r="12" fill="none" stroke="#6ecbff" stroke-width="1.6" opacity=".5"/><circle cx="20" cy="20" r="16" fill="none" stroke="#889eff" stroke-width="1" stroke-dasharray="5 4" opacity=".65"/><path fill="#b4edff" d="m20 5 2.5 10.6 9.6-3.1-7.5 7.9 7.9 7-10-2.6L20 35l-2.4-10.2-10.1 2.6 8-7-7.6-7.9 9.6 3.1z"/><path fill="#f1fcff" d="m20 13 2 5 4 2.2-4 2-2 5.3-2-5.3-4-2 4-2.2z"/>',
  lance: '<path fill="#6856cc" d="m4 35 13-18L34 6l-12 19z"/><path fill="#b89dff" d="m10 31 11-16L36 4l-9 17z"/><path fill="#f3dfff" d="M21 15 36 4 24 18 10 31z"/><path fill="#77a2ff" d="M24 18 36 4l-9 17-17 10z"/><path stroke="#baa0ff" stroke-width="1.25" stroke-linecap="round" d="m5 26 9-9m11 13 7-6m-9 9 2-2"/><circle cx="11" cy="12" r="1.4" fill="#e7d6ff"/><circle cx="32" cy="30" r="1" fill="#e4cfff"/>',
  blizzard: '<path fill="#5676d2" d="M5 17a5 5 0 0 1 6.5-4.8 8 8 0 0 1 14.8-1.8 6.5 6.5 0 1 1 2.2 12.5H10A5 5 0 0 1 5 17z"/><path fill="#b3deff" d="M7 15.7a4 4 0 0 1 6.2-3.4 7 7 0 0 1 13.1-.1A5 5 0 1 1 29 21H11a4.1 4.1 0 0 1-4-5.3z"/><path fill="#e4f6ff" d="M13 12.3a7 7 0 0 1 13.3-.1A6 6 0 0 0 21 10c-3.1 0-5.7 1.3-8 2.3z"/><path stroke="#82ceff" stroke-width="2" stroke-linecap="round" d="m12 25-4 6m11-6-5 9m12-9-4 6m10-6-4 6"/><path fill="#ecf8ff" d="m29 25 1.1 2.9L33 29l-2.9 1.1L29 33l-1.1-2.9L25 29l2.9-1.1z"/>',
  blink: '<path fill="#7774ed" d="M22 4 8 24h11l-2 13 17-21H23z"/><path fill="#babeff" d="M24 3 11 22h11l-3 13 14-18H22z"/><path fill="#f4ecff" d="M24 3 11 22h11l-1-3h-5z"/><path stroke="#b3a9ff" stroke-width="1.25" stroke-linecap="round" d="M8 11h6m-9 5h6m18 12h6m-9 4h6"/><circle cx="32" cy="8" r="1.25" fill="#e5dbff"/>',
  barrier: '<path d="m20 4 14 6v10c0 6.7-6.1 12.1-14 16C12.1 32.1 6 26.7 6 20V10z" fill="#4092d8"/><path d="m20 7 11 5v8c0 5.2-4.3 9.7-11 13-6.7-3.3-11-7.8-11-13v-8z" fill="#81e8ed" stroke="#d4fcff" stroke-width="1.4"/><path d="m20 9 9 4v6.5L20 31z" fill="#4cb5df"/><path d="M20 13v14m-6-10 12 7m0-7-12 7" stroke="#f5ffff" stroke-width="1.6" stroke-linecap="round"/>',
  orb: '<path d="M5 27c-1-4.5 5-12 11-15S29 7 34 10" fill="none" stroke="#8ae4ff" stroke-width="1.6" stroke-linecap="round"/><circle cx="20" cy="20" r="11" fill="#5268cf" stroke="#88f0ff" stroke-width="1.5"/><circle cx="21" cy="18" r="6.5" fill="#a6effb"/><path d="M22 11v14m-6-10 12 6m0-6-12 6" stroke="#f8fdff" stroke-width="1.3"/><path d="M5 27c2 6 14 5 24-1 6-4 9-9 7-12" fill="none" stroke="#cabbff" stroke-width="2" stroke-linecap="round"/><circle cx="32" cy="23" r="2" fill="#f1ffff"/>',
  comet: '<path d="m18 8 7 6-4 18-5-15z" fill="#8de9ff"/><path d="m18 8 3 24 4-18z" fill="#5b8fea"/><path d="m8 13 5 4-2 11-4-9zm22 2 5 4-6 11 1-9z" fill="#c7e6ff"/><path d="m17 4 3-2m7 7 4-4M6 10l2-3m24 5 3-2" stroke="#abc4ff" stroke-width="1.4" stroke-linecap="round"/><path d="m13 34 7 2 8-3M9 34l4-4m14-1 4 4" fill="none" stroke="#c8f9ff" stroke-width="1.5" stroke-linecap="round"/>',
} as const;

export function spellArt(name: keyof typeof art | keyof typeof fireArt | keyof typeof advancedArt | Icon) {
  if (name in advancedArt) return `<svg aria-hidden="true" width="40" height="40" viewBox="0 0 40 40">${advancedArt[name as keyof typeof advancedArt]}</svg>`;
  if (name in fireArt) return `<svg aria-hidden="true" width="40" height="40" viewBox="0 0 40 40">${fireArt[name as keyof typeof fireArt]}</svg>`;
  if (!(name in art)) return icon(name as Icon, 27);
  return `<svg aria-hidden="true" width="40" height="40" viewBox="0 0 40 40">${art[name as keyof typeof art]}</svg>`;
}

const fireArt = {
  fireball: '<path fill="#ec653f" d="M35 5c-1 17-8 30-20 30A10 10 0 0 1 6 25C6 16 16 10 27 8l-4 5c4-1 8-4 12-8z"/><path fill="#ffba69" d="M28 15c-2 11-8 17-13 17a7 7 0 0 1-6-7c0-4 5-8 12-10l-2 4z"/><circle cx="15" cy="25" r="4" fill="#fff0ad"/>',
  fireBlast: '<path fill="#f46c51" d="m26 4-6 12 15-3-9 10 8 6-13-1-6 9-2-13-9-1 10-7-2-8 8 5z"/><path fill="#ffca77" d="m24 13-3 8 7-1-5 5 2 4-6-2-3 5v-7l-6-1 6-4z"/>',
  pyro: '<path fill="#a83b6d" d="M37 3c2 18-10 34-23 33C6 35 3 32 3 25c0-8 9-16 21-20l-3 7z"/><path fill="#fa754f" d="M32 10c-1 10-6 22-17 22a8 8 0 0 1-8-8c0-5 6-11 14-14l-3 7z"/><path fill="#ffe7a0" d="m18 16 3 6 7 1-7 2-4 6-2-6-5-2 6-2z"/>',
  flamestrike: '<path fill="#db523d" d="M6 34h29l-7-6c2-8-2-13-7-24 0 9-5 11-7 19-2-2-2-5-2-9-5 5-7 11-6 20z"/><path fill="#ffbb6d" d="M13 32h16c-5-5-5-8-7-17-1 7-6 9-9 17z"/><path stroke="#fff0ab" stroke-width="1.5" d="M7 35h28M1 31h8m22 0h6"/>',
  livingBomb: '<circle cx="19" cy="23" r="11" fill="#e05054" stroke="#ffab68" stroke-width="2"/><path d="M15 14v-4h9v5m0-3 5-5h4" fill="none" stroke="#ffcf8d" stroke-width="2"/><path fill="#ffedac" d="m32 3 2 4 4 2-4 1-2 5-1-5-5-1 5-2zm-14 12 2 6 6 2-6 1-2 6-1-6-5-1 5-2z"/>',
  combustion: '<path fill="#b54974" d="M20 3c9 7 13 16 12 24a12 12 0 0 1-24-1c0-6 3-11 8-15 0 4 1 5 2 6 3-5 3-8 2-14z"/><path fill="#ff9952" d="M21 13c7 9 8 16 3 21a8 8 0 0 1-12-7c0-4 2-5 5-8 0 3 1 3 2 4z"/><path fill="#fff1ad" d="m21 22 2 5 5 2-5 1-2 5-1-5-5-1 5-2z"/>',
  fireBarrier: '<path fill="#b94463" d="m20 5 14 6v10c0 6-6 11-14 15C12 32 6 27 6 21V11z"/><path fill="#ef8758" stroke="#ffe4ab" stroke-width="1.4" d="m20 9 10 4v8c0 4-4 8-10 11-6-3-10-7-10-11v-8z"/><path fill="#fff1ad" d="M21 13c6 6 6 13-1 14-6 0-6-6-3-10l1 3c2-2 2-4 3-7z"/>',
} as const;

const advancedArt = {
  frostGale: '<path d="M5 15 30 9m-23 13 30-9M4 29l24-8" fill="none" stroke="#75d3ff" stroke-width="3" stroke-linecap="round"/><path d="m29 4 2 4 5 1-5 2-2 4-2-4-4-2 4-1zM22 19l1 3 4 1-4 1-1 3-1-3-4-1 4-1z" fill="#dcfaff"/>',
  auroraStrike: '<path d="M24 2 9 21l10-1-3 16 15-22-12 2z" fill="#9b95fd" stroke="#cae4ff" stroke-width="1.4"/><path d="m21 11-6 9 6-1-2 8 8-11-7 1z" fill="#f9f1ff"/><path d="m5 30 6-3m17 4 6-4" stroke="#89e8ff" stroke-width="2" stroke-linecap="round"/>',
  chainLightning: '<path d="m6 8 12 1-5 10 13-3-3 13 12-3" fill="none" stroke="#a187ff" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><path d="m6 8 12 1-5 10 13-3-3 13 12-3m-13 3-9 6m5-26 8-5" fill="none" stroke="#fff0a5" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="6" cy="8" r="2" fill="#fffefa"/><circle cx="35" cy="26" r="2.6" fill="#fffefa"/>',
  frostChain: '<path d="M6 28 15 11l9 15 10-15" fill="none" stroke="#72caff" stroke-width="3"/><g fill="#d3f4ff"><path d="m6 22 6 6-6 6-6-6zm9-17 6 6-6 6-6-6zm9 15 6 6-6 6-6-6zm10-14 5 5-5 5-5-5z"/></g>',
  iceBloom: '<path d="M20 36 4 24l3-7 9 3L20 3l5 17 8-3 3 7z" fill="#73a4fa"/><path d="m20 4 5 21-5 11-5-11zm-16 20 14 6-7-12zm32 0-14 6 7-12z" fill="#c5faff"/><circle cx="20" cy="24" r="3" fill="#fff7ff"/>',
  whiteout: '<path d="M4 17c8-3 10-12 19-10 8 2 11 9 7 15-4 7-15 7-18 1-2-4 3-7 7-5m16 5C28 36 16 35 7 31" fill="none" stroke="#badcff" stroke-width="3" stroke-linecap="round"/><path d="m28 6 1.5-4 1.5 4 4 1-4 2-2 4-1-4-4-2zm-18 17 1 4 4 1-4 1-1 4-1-4-4-1 4-1z" fill="#f0f3ff"/>',
  winterMoon: '<circle cx="21" cy="18" r="13" fill="#7692d9"/><path d="M24 5a13 13 0 1 0 10 17A13 13 0 0 1 24 5Z" fill="#d4f2ff"/><path d="M18 28v10m-5-7 10 5m0-5-10 5" stroke="#e0eaff" stroke-width="1.2"/>',
  absoluteZero: '<circle cx="20" cy="20" r="16" fill="none" stroke="#92b7f7" stroke-width="1.5"/><path d="M20 5v30M7 12.5l26 15m0-15L7 27.5m9-20 4 4 4-4m-8 25 4-4 4 4m-14-12 6-1-2-6m16 6-6 1 2 6" stroke="#d7feff" stroke-width="2" fill="none"/><circle cx="20" cy="20" r="4" fill="#f9ffff"/>',
  emberFan: '<path d="M7 33 12 9l7 8 8-13 2 13 8-4-5 12Z" fill="#d55656"/><path d="m8 32 8-17 2 8 8-10 3 7 6-2-7 7z" fill="#ffa360"/><path d="M8 32 30 21 20 26l-3-4z" fill="#ffedaa"/>',
  flashpoint: '<circle cx="20" cy="20" r="13" fill="none" stroke="#f3816e" stroke-width="1.5" stroke-dasharray="3 2"/><path d="m21 4 3 10 10-4-6 8 8 6-10-1-3 12-5-9-10 4 5-9-8-4 10-1z" fill="#ffa465"/><path d="m20 12 3 6 6 2-6 2-2 7-3-7-6-2 6-2z" fill="#fff0b4"/>',
  phoenix: '<path d="M20 16C12 14 9 4 2 4l4 13 8 6-5 7 10-5 1 13 4-11 9 3-4-7 6-6 3-13c-7 0-10 10-18 12z" fill="#f07851"/><path d="M6 9c3 5 9 9 14 10 6-2 10-7 14-10l-6 12-7 4-6-3z" fill="#ffc572"/><path d="m19 16 4 3-3 7-2-6z" fill="#fff2b3"/>',
  supernova: '<circle cx="20" cy="20" r="15" fill="#a53565" stroke="#ffa375" stroke-width="1.7"/><circle cx="20" cy="20" r="11" stroke="#ffb569" fill="#e66155"/><path d="m20 3 3 13 12-6-9 9 10 5-13-1-3 14-3-14-13 2 10-6-9-9 12 6z" fill="#ffca74"/><circle cx="20" cy="20" r="4" fill="#fff7cf"/>',
  rimeVolley: '<path fill="#84c7ff" d="m6 10 25-6-13 10-9 1zm0 13 30-9-13 14-11 2zm4 11 24-10-7 11-10 2z"/><path stroke="#dcfaff" stroke-linecap="round" stroke-width="1.8" d="m9 12 17-6M9 24l24-8m-20 18 19-8"/>',
  frostBind: '<path d="m20 4 13 8v16l-13 8-13-8V12z" fill="#376d9e" stroke="#9ff6ff" stroke-width="1.8"/><path fill="#b9f4ff" d="m20 8 5 10 5 2-5 2-5 10-5-10-5-2 5-2z"/><path stroke="#f3ffff" stroke-width="1.8" d="M20 11v18m-7-9h14"/>',
  glacierWall: '<path d="M3 32V20l5-5 6 3V9l6-6 6 6v8l6-3 5 7v11l-17 5z" fill="#608bd3" stroke="#b3eeff" stroke-width="1.6"/><path d="M20 5v30l6-3V10zm-12 12v16l6 1V19zm24-1v17l5-1V22z" fill="#b7f0ff"/><path stroke="#e8fbff" stroke-width="1.3" d="m4 29 15-5 17 4"/>',
  glacialCollapse: '<path d="m20 3 7 7-4 7 9-4 5 5-12 5 6 7-6 6-6-10-4 9-8-3 6-9-10-2 2-8 13 6-4-9z" fill="#8a97ec"/><path d="m23 6-7 11 4 2-8 4 9-1-1 9 5-10 8-4-11 2z" fill="#e3ffff"/><path d="m3 31 5 2-4 4zm31-4 4 3-2 4z" fill="#a1ddff"/>',
  cinderMarks: '<g fill="#f98555" stroke="#ffd081" stroke-width="1.2"><path d="m10 12 5 8-5 8-5-8zm10-6 5 9-5 9-5-9zm10 7 5 9-5 9-5-9z"/></g><path stroke="#ffe7ad" stroke-width="1.5" d="M10 17v6m10-12v8m10-1v8"/>',
  emberBrand: '<path d="M13 5h14l-4 9 6 7-7 15-10-11 5-9z" fill="#ce5655" stroke="#ff9f61" stroke-width="1.5"/><path d="m19 8 5 1-5 9 6 2-4 11-5-7 5-5-4-1z" fill="#ffe098"/><path d="M5 16h6m18-4h6m-1 16h4M4 29h7" stroke="#ff9358" stroke-width="1.4"/>',
  meteor: '<path d="m37 3-8 16c1 10-6 17-16 17-6 0-10-4-10-10 0-8 6-14 15-16l-1 5Z" fill="#e16140"/><path d="m30 8-10 11 6-3c-1 10-5 15-13 15-5 0-7-3-6-7l7-8-1 6z" fill="#feb76b"/><path d="m10 24 6-5 7 4-2 7-9 2z" fill="#77434e" stroke="#ffe8a8" stroke-width="1.5"/>',
  cinderVortex: '<path d="M6 11c10-9 26-7 29 4 3 10-6 18-17 18-8 0-14-6-13-11C6 14 17 9 26 15c4 3 3 8-2 10-5 2-9-1-7-4" fill="none" stroke="#f88d54" stroke-width="3.4" stroke-linecap="round"/><path d="m18 15 2 4 4 1-4 2-2 5-2-5-4-2 4-1z" fill="#ffe9ab"/>',
  infernoHeart: '<path d="M20 4c3 8 11 8 14 16 4 10-6 16-14 17C11 36 2 30 6 19c2-5 7-6 8-11 0 5 1 7 3 8z" fill="#e3644e" stroke="#ffa965" stroke-width="1.5"/><path d="M20 22c-4-7-12-2-7 5l7 7 7-7c5-7-3-12-7-5Z" fill="#fff0a8"/><path d="M20 2v5m14 3 3-4M5 11 2 8" stroke="#ffca75" stroke-width="1.6"/>',
} as const;
