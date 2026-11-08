// The collection's categories. These mirror the tabs in the Collection Tracker Google Sheet,
// so items can sync back to the right tab and columns.

export type Category = {
  name: string;
  slug: string;
  /** Item-specific fields, in sheet column order. The first one is the item's name. */
  fields: string[];
  conditions: string[];
  /** Suggested values for fields that have common options. */
  suggestions?: Record<string, string[]>;
  /** Cards: the tab has a Back Photo column, and photos are shown as Front and Back. */
  backPhoto?: boolean;
};

const CARD_CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];
const PAPER_CONDITIONS = ["Mint", "Near Mint", "Very Good", "Good", "Fair", "Poor"];

export const CATEGORIES: Category[] = [
  {
    name: "Sports Cards",
    slug: "sports-cards",
    fields: ["Player", "Year", "Brand / Set", "Card #", "Parallel / Variant", "Grade"],
    conditions: ["Raw", "Graded"],
    backPhoto: true,
  },
  {
    name: "Magic: The Gathering",
    slug: "magic",
    fields: ["Card Name", "Set", "Collector #", "Finish"],
    conditions: CARD_CONDITIONS,
    suggestions: { Finish: ["Non-foil", "Foil", "Etched"] },
    backPhoto: true,
  },
  {
    name: "Yu-Gi-Oh!",
    slug: "yugioh",
    fields: ["Card Name", "Set", "Set Code", "Rarity", "Edition"],
    conditions: CARD_CONDITIONS,
    suggestions: { Edition: ["1st Edition", "Unlimited", "Limited Edition"] },
    backPhoto: true,
  },
  {
    name: "Pokémon",
    slug: "pokemon",
    fields: ["Card Name", "Set", "Card #", "Rarity", "Variant"],
    conditions: CARD_CONDITIONS,
    suggestions: { Variant: ["Non-Holo", "Holo", "Reverse Holo", "1st Edition", "Shadowless"] },
    backPhoto: true,
  },
  {
    name: "Figures",
    slug: "figures",
    fields: ["Name", "Line / Brand", "Year"],
    conditions: ["In Box", "Loose", "Opened"],
  },
  {
    name: "Magazines",
    slug: "magazines",
    fields: ["Title", "Issue", "Date", "Cover / Feature"],
    conditions: PAPER_CONDITIONS,
  },
  {
    name: "Newspapers",
    slug: "newspapers",
    fields: ["Newspaper", "Date", "Headline"],
    conditions: PAPER_CONDITIONS,
  },
  {
    name: "Ornaments",
    slug: "ornaments",
    fields: ["Name", "Brand / Series", "Year"],
    conditions: ["In Box", "No Box", "Damaged Box"],
  },
  {
    name: "Sets & Sealed",
    slug: "sets-sealed",
    fields: ["Product", "Year", "Brand", "Sport / Game", "Type"],
    conditions: ["Factory Sealed", "Sealed", "Shrink Torn"],
    suggestions: { Type: ["Factory Set", "Hobby Box", "Retail Box", "Wax Box", "Blaster", "Pack", "Tin / Can", "Other"] },
  },
  {
    name: "Other",
    slug: "other",
    fields: ["Item", "Type", "Year"],
    conditions: ["New", "Like New", "Used", "In Box", "Loose"],
  },
];

export const STATUSES = ["Keep", "Sell", "Listed", "Sold"] as const;
export type Status = (typeof STATUSES)[number];

export function categoryByName(name: string): Category | undefined {
  return CATEGORIES.find((c) => c.name === name);
}

/** The item's display name is its category's first field (Player, Card Name, Title, ...). */
export function nameField(category: Category): string {
  return category.fields[0]!;
}
