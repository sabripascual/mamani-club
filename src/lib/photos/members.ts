import type { Member } from "@/lib/expenses/types";
import { displayName, initials } from "@/lib/utils";
import type { MiniMember } from "@/components/photos/gallery";

export function toMiniMembers(members: Member[]): Record<string, MiniMember> {
  return Object.fromEntries(members.map((m) => [m.id, { name: displayName(m), initials: initials(m), avatar_url: m.avatar_url }]));
}
