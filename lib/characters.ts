/** The playable characters, shared by the daily board (第一層), the public table (第二層) and 領地 (第三層).
 *  阿瓜, 阿科 and 阿神 come from the shop's 角色卡池 (testing: everyone can play them; their 3D models are to come). */
export const CHARACTERS = [
  { name: "伯爵", avatar: "/art/avatars/vampire.jpg", colour: "#7C3AED", actor: "vampire" },
  { name: "阿殭", avatar: "/art/avatars/jiangshi.jpg", colour: "#2563EB", actor: "jiangshi" },
  { name: "阿木", avatar: "/art/avatars/mummy.jpg", colour: "#D97706", actor: "mummy" },
  { name: "阿強", avatar: "/art/avatars/zombie.jpg", colour: "#16A34A", actor: "zombie" },
  { name: "阿瓜", avatar: "/art/avatars/pumpkin.jpg", colour: "#EA580C", actor: "pumpkin" },
  { name: "阿科", avatar: "/art/avatars/franken.jpg", colour: "#0891B2", actor: "franken" },
  { name: "阿神", avatar: "/art/avatars/reaper.jpg", colour: "#9333EA", actor: "reaper" },
] as const;

/** What each character can do (shown when picking). */
export const PERKS: Record<string, string> = {
  pumpkin: "經過起點多收 20%",
  franken: "每局第一次交租減半",
  reaper: "每局一次擲到 6 再擲多次",
};

const PICK_KEY = "boolionaire-character";

/** The character you last picked (伯爵 when nothing is saved). */
export function savedPick(): number {
  try {
    const n = Number(window.localStorage.getItem(PICK_KEY));
    return Number.isInteger(n) && n >= 0 && n < CHARACTERS.length ? n : 0;
  } catch {
    return 0;
  }
}

export function savePick(i: number) {
  try {
    window.localStorage.setItem(PICK_KEY, String(i));
  } catch {
    // Remembering the pick is only a convenience.
  }
}
