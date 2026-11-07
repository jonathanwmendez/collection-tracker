import type { Status } from "./categories";

/** What Claude returns after looking at an item's photos, before you review it. */
export type Draft = {
  category: string;
  /** Field values keyed by the category's field names, including the name field. */
  fields: Record<string, string>;
  condition: string;
  quantity: number;
  /** Estimated value for one unit, in USD. Null when Claude couldn't estimate. */
  estimate: number | null;
  range: [number, number] | null;
  confidence: "high" | "medium" | "low";
  notes: string;
  uncertain: string;
  suggestedCategory: string;
};

/** What the app saves when you approve a draft. */
export type NewItem = {
  category: string;
  fields: Record<string, string>;
  condition: string;
  quantity: number;
  estimate: number | null;
  status: Status;
  notes: string;
};
