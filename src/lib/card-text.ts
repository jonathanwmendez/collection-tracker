// Reads what a card says from the text the phone recognized (OCR). Pure functions, so they can be tested.
// The Scan page reads the photos on the phone and sends the lines here; nothing here calls Claude.

export type OcrLine = { text: string; height: number; y: number };

export type ScanKind = "sports" | "magic" | "pokemon" | "yugioh" | "other";

const clean = (s: string) => s.replace(/[|“”"`_~]+/g, " ").replace(/\s+/g, " ").trim();
const lettersShare = (s: string) => (s.replace(/[^A-Za-z]/g, "").length || 0) / Math.max(1, s.replace(/\s/g, "").length);
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(" ")
    .map((w) => (/^(ii|iii|iv)$/.test(w) ? w.toUpperCase() : w.replace(/(^|[-'’.])([a-z])/g, (_, p, c) => p + c.toUpperCase())))
    .join(" ")
    .replace(/\bJr\b\.?/g, "Jr.")
    .replace(/\bSr\b\.?/g, "Sr.")
    .replace(/\bMc([a-z])/g, (_, c) => "Mc" + c.toUpperCase());
// ---------- sports cards (read from the back) ----------

// Brands as they appear in copyright lines and logos, most specific first.
const BRANDS: Array<[RegExp, string]> = [
  [/upper\s*deck/i, "Upper Deck"],
  [/stadium\s*club/i, "Topps Stadium Club"],
  [/bowman/i, "Bowman"],
  [/o-?pee-?chee/i, "O-Pee-Chee"],
  [/topps/i, "Topps"],
  [/fleer\s*ultra|\bultra\b/i, "Fleer Ultra"],
  [/fleer/i, "Fleer"],
  [/donruss/i, "Donruss"],
  [/\bleaf\b/i, "Leaf"],
  [/pinnacle/i, "Pinnacle"],
  [/\bscore\b/i, "Score"],
  [/pro\s*set/i, "Pro Set"],
  [/sky\s*box/i, "SkyBox"],
  [/nba\s*hoops|\bhoops\b/i, "NBA Hoops"],
  [/collector'?s\s*choice/i, "Collector's Choice"],
  [/action\s*packed/i, "Action Packed"],
  [/\bclassic\b/i, "Classic"],
  [/pacific/i, "Pacific"],
  [/playoff/i, "Playoff"],
  [/sportflics/i, "Sportflics"],
  [/\bfinest\b/i, "Topps Finest"],
  [/\bflair\b/i, "Flair"],
  [/\bselect\b/i, "Select"],
  [/prizm/i, "Panini Prizm"],
  [/panini/i, "Panini"],
  [/kellogg/i, "Kellogg's"],
  [/impel/i, "Impel"],
  [/wild\s*card/i, "Wild Card"],
  [/star\s*pics/i, "Star Pics"],
  [/front\s*row/i, "Front Row"],
];

const TEAM_OR_LABEL_WORDS =
  /\b(born|bats|throws|height|weight|ht|wt|team|season|career|totals?|games|avg|pos(ition)?|draft(ed)?|college|home|acquired|record|stats?|batting|pitching|rushing|receiving|scoring|points|rebounds|assists|printed|inc|corp|league|official|licensed|trademark|properties|players|association|nfl|nba|mlb|nhl|mlbpa|nflpa|pga|tour|usa|card|no\.?)\b/i;

export type SportsBack = {
  player: string;
  year: string;
  brand: string;
  number: string;
  /** Fields the scanner couldn't read, for the "Check this" note. */
  missing: string[];
};

export function parseSportsBack(lines: OcrLine[]): SportsBack {
  const texts = lines.map((l) => clean(l.text)).filter(Boolean);
  const all = texts.join("\n");

  // Year: the copyright line is the card's year ("© 1990 Fleer Corp.", "(c) 1991 THE TOPPS COMPANY").
  const yearMatch =
    all.match(/(?:©|\(c\)|\bc\)|copyright|®)\s*(?:by\s+)?(19[4-9]\d|20[0-3]\d)/i) ??
    all.match(/\b(19[4-9]\d|20[0-3]\d)\s+(?:the\s+)?(?:topps|fleer|upper deck|donruss|score|leaf|pro set|skybox|pinnacle|bowman|panini)/i);
  const year = yearMatch?.[1] ?? "";

  let brand = "";
  for (const [re, name] of BRANDS) {
    if (re.test(all)) {
      brand = name;
      break;
    }
  }

  // Card number: "No. 123", "#123", "NO 123", or a short number alone on the top line.
  const numberMatch =
    all.match(/\b(?:no|n°|nr)\.?\s*(\d{1,4}[a-z]?)\b/i) ??
    all.match(/#\s*(\d{1,4}[a-z]?)\b/i) ??
    texts.slice(0, 3).join(" ").match(/^\s*(\d{1,3})\b/);
  const number = numberMatch?.[1] ?? "";

  // Player: the tallest line near the top that reads like a name (2 to 4 words, mostly letters).
  const top = lines.slice().sort((a, b) => a.y - b.y).slice(0, 8);
  const nameLike = top
    .map((l) => ({ ...l, text: clean(l.text).replace(/[^A-Za-z.'’\- ]/g, " ").replace(/\s+/g, " ").trim() }))
    .filter((l) => {
      const words = l.text.split(" ").filter((w) => w.length > 1);
      return words.length >= 2 && words.length <= 4 && lettersShare(l.text) > 0.85 && !TEAM_OR_LABEL_WORDS.test(l.text);
    })
    .sort((a, b) => b.height - a.height);
  const player = nameLike[0] ? titleCase(nameLike[0].text) : "";

  const missing = [!player && "player", !year && "year", !brand && "brand", !number && "card number"].filter(Boolean) as string[];
  return { player, year, brand, number, missing };
}

// ---------- graded slabs and certificates ----------

export type Slab = { company: string; grade: string; cert: string };

/** A graded slab's label: company, grade, and certification number. */
export function parseSlab(lines: OcrLine[]): Slab | null {
  const all = lines.map((l) => clean(l.text)).join("\n");
  const company = /\bpsa\b/i.test(all) ? "PSA" : /\bbgs\b|beckett/i.test(all) ? "BGS" : /\bsgc\b/i.test(all) ? "SGC" : /\bcgc\b/i.test(all) ? "CGC" : "";
  if (!company) return null;
  const grade =
    all.match(/\b(?:gem\s*mt|gem\s*mint|mint|nm-mt|nm|ex-mt|ex|vg-ex|vg|good|fair|poor|pristine)\s*(10|[1-9](?:\.5)?)\b/i)?.[1] ??
    all.match(/\b(10|[1-9]\.5|[1-9])\s*$/m)?.[1] ??
    "";
  const cert = all.match(/\b(\d{7,10})\b/)?.[1] ?? "";
  if (!grade && !cert) return null;
  return { company, grade, cert };
}

const AUTHENTICATORS: Array<[RegExp, string]> = [
  [/psa\s*\/?\s*dna/i, "PSA/DNA"],
  [/james\s*spence|\bjsa\b/i, "JSA"],
  [/beckett|\bbas\b/i, "Beckett (BAS)"],
  [/fanatics/i, "Fanatics"],
  [/upper\s*deck\s*authenticated|\buda\b/i, "Upper Deck Authenticated"],
  [/mlb\s*authentic/i, "MLB Authentication"],
  [/steiner/i, "Steiner"],
  [/tristar/i, "Tristar"],
  [/\bsgc\b/i, "SGC"],
  [/\bpsa\b/i, "PSA/DNA"],
];

/** A certificate of authenticity: who issued it and its number. */
export function parseCoa(lines: OcrLine[]): { authenticator: string; cert: string } {
  const all = lines.map((l) => clean(l.text)).join("\n");
  let authenticator = "";
  for (const [re, name] of AUTHENTICATORS) {
    if (re.test(all)) {
      authenticator = name;
      break;
    }
  }
  // Cert and hologram numbers: letters plus digits ("AB12345", "Z 12345", "CV123456") or a long number.
  const cert =
    all.match(/\b(?:cert(?:ificate)?|serial|holo(?:gram)?|no)\.?\s*(?:#|number|no\.?)?\s*[:#]?\s*([A-Z]{0,3}\s?\d{5,10})\b/i)?.[1] ??
    all.match(/\b([A-Z]{1,3}\s?\d{5,9})\b/)?.[1] ??
    all.match(/\b(\d{7,10})\b/)?.[1] ??
    "";
  return { authenticator, cert: cert.replace(/\s+/g, "") };
}

// ---------- trading card games (read from the front) ----------

export type MagicText = { name: string; setCode: string; number: string };

/** Magic: the name is the top line; the set code and collector number are at the bottom left. */
export function parseMagic(lines: OcrLine[]): MagicText {
  const sorted = lines.slice().sort((a, b) => a.y - b.y);
  const texts = sorted.map((l) => clean(l.text));
  const bottom = texts.slice(-5).join("\n");
  // "MH2 • EN", "MKM • EN", "C21 EN"
  const setCode = bottom.match(/\b([A-Z0-9]{3,5})\s*[•·*.\-]?\s*EN\b/)?.[1] ?? "";
  // "138/303 U", "0123", "263 C"
  const number = bottom.match(/\b0*(\d{1,4})(?:\s*\/\s*\d{1,4})?\s*[CURMLSTP]?\b/)?.[1] ?? "";
  const name = (texts.find((t) => lettersShare(t) > 0.7 && t.replace(/[^A-Za-z]/g, "").length >= 3) ?? "").replace(/[^A-Za-z ,'’\-]/g, " ").replace(/\s+/g, " ").trim();
  return { name, setCode: setCode.toLowerCase(), number };
}

export type PokemonText = { name: string; number: string; total: string };

/** Pokémon: the name is near the top; "4/102" (number / set size) is at the bottom. */
export function parsePokemon(lines: OcrLine[]): PokemonText {
  const sorted = lines.slice().sort((a, b) => a.y - b.y);
  const texts = sorted.map((l) => clean(l.text));
  const nums = texts.join("\n").match(/\b0*(\d{1,3}[a-z]?)\s*\/\s*0*(\d{2,3})\b/i);
  const top = texts.slice(0, 4).find((t) => {
    const w = t.replace(/\b(basic|stage\s*\d|hp\s*\d*|\d+\s*hp|evolves from.*)\b/gi, "").trim();
    return lettersShare(w) > 0.7 && w.replace(/[^A-Za-z]/g, "").length >= 3;
  });
  const name = (top ?? "")
    .replace(/\b(basic|stage\s*\d|evolves from.*)\b/gi, "")
    .replace(/\b\d+\s*hp\b|\bhp\s*\d+\b/gi, "")
    .replace(/[^A-Za-z .'’\-é]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { name, number: nums?.[1] ?? "", total: nums?.[2] ?? "" };
}

export type YugiohText = { name: string; setCode: string };

/** Yu-Gi-Oh!: the set code ("LOB-001", "MRD-EN036") is printed under the art on the right. */
export function parseYugioh(lines: OcrLine[]): YugiohText {
  const sorted = lines.slice().sort((a, b) => a.y - b.y);
  const texts = sorted.map((l) => clean(l.text));
  const code = texts.join("\n").match(/\b([A-Z0-9]{2,4})\s*-\s*([A-Z]{0,2})\s*(\d{3})\b/);
  const setCode = code ? `${code[1]}-${code[2]}${code[3]}`.toUpperCase() : "";
  const name = (texts.find((t) => lettersShare(t) > 0.7 && t.replace(/[^A-Za-z]/g, "").length >= 3) ?? "").replace(/[^A-Za-z0-9 ,'’\-]/g, " ").replace(/\s+/g, " ").trim();
  return { name, setCode };
}

// ---------- what kind of card is this? ----------

export type CardKind = "sports" | "magic" | "pokemon" | "yugioh";

// Words and patterns printed on each kind of card (front or back). Each match adds to that kind's score.
const SIGNS: Record<CardKind, RegExp[]> = {
  pokemon: [
    /\bhp\s?\d{2,3}\b|\b\d{2,3}\s?hp\b/i,
    /\bweakness\b/i,
    /\bresistance\b/i,
    /\bretreat\b/i,
    /pok[eé]mon/i,
    /\bnintendo\b|creatures|game\s*freak/i,
    /\b(basic|stage\s*[12]|evolves\s*from|trainer|supporter|energy)\b/i,
    /\b\d{1,3}\s*\/\s*\d{2,3}\b/,
  ],
  magic: [
    /wizards\s*of\s*the\s*coast|\bwotc\b/i,
    /\billus\b/i,
    /\b(creature|instant|sorcery|enchantment|artifact|planeswalker)\b/i,
    /\blegendary\b|\bbasic\s*land\b|\btoken\b/i,
    /\b[A-Z0-9]{3,5}\s*[•·*.]\s*EN\b/,
    /deckmaster|magic\s*the\s*gathering/i,
    /\b\d{1,4}\s*\/\s*\d{1,4}\s*[CURMLS]\b/,
  ],
  yugioh: [
    /\bkonami\b/i,
    /\batk\s*\/|\bdef\s*\//i,
    /\[\s*(spell|trap)\s*card/i,
    /\b(spell|trap)\s*card\b/i,
    /\b[A-Z0-9]{2,4}\s*-\s*(EN|E|FR|DE|IT|SP|PT)?\s*\d{3}\b/,
    /\b(fusion|synchro|xyz|link|ritual|pendulum|tuner|effect)\b.*\]/i,
    /\b1st\s*edition\b|limited\s*edition/i,
  ],
  sports: [
    new RegExp(BRANDS.map(([re]) => re.source).join("|"), "i"),
    /\b(mlb|nba|nfl|nhl|mlbpa|nflpa|nbpa|nhlpa|major\s*league|national\s*football|national\s*basketball)\b/i,
    /\b(bats|throws|born|ht|wt|height|weight|college|drafted|acquired)\b\s*:?/i,
    /\b(avg|hr|rbi|era|whip|yds|td|int|rec|pts|reb|ast|stl|blk)\b.*\b(avg|hr|rbi|era|whip|yds|td|int|rec|pts|reb|ast|stl|blk)\b/i,
    /\b(pitcher|catcher|infield|outfield|shortstop|quarterback|running\s*back|receiver|linebacker|guard|forward|center|goalie|defense)\b/i,
    /\b(19[0-9]{2}|20[0-9]{2})\b.*\b(season|totals?|career)\b/i,
  ],
};

/** Scores the text against each kind of card. Highest first; kinds with no signs are left out. */
export function detectKinds(lines: OcrLine[]): Array<{ kind: CardKind; score: number }> {
  const all = lines.map((l) => clean(l.text)).join("\n");
  return (Object.keys(SIGNS) as CardKind[])
    .map((kind) => ({ kind, score: SIGNS[kind].filter((re) => re.test(all)).length }))
    .filter((k) => k.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * The kind of card, when the text makes it clear: at least 2 signs and ahead of the next kind.
 * Pokémon, Magic, and Yu-Gi-Oh! are usually clear from the front alone; sports cards from the back.
 */
export function detectKind(lines: OcrLine[]): CardKind | null {
  const [a, b] = detectKinds(lines);
  if (!a || a.score < 2) return null;
  if (b && b.score >= a.score) return null;
  return a.kind;
}
