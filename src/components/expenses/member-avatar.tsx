import { Avatar } from "@/components/ui/avatar";
import { displayName, initials } from "@/lib/utils";
import type { Member } from "@/lib/expenses/types";

export function MemberAvatar({ m, size = "sm" }: { m: Member | undefined; size?: "sm" | "md" | "lg" }) {
  if (!m) return <Avatar initials="?" size={size} />;
  return <Avatar src={m.avatar_url} initials={initials(m)} size={size} />;
}

export function memberName(m: Member | undefined, meId?: string) {
  if (!m) return "Alguien";
  if (meId && m.id === meId) return "Vos";
  return displayName(m);
}

export function AvatarStack({ members, max = 4 }: { members: (Member | undefined)[]; max?: number }) {
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <span className="flex -space-x-2">
      {shown.map((m, i) => <MemberAvatar key={m?.id ?? i} m={m} />)}
      {rest > 0 && (
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-cream text-xs font-semibold ring-2 ring-cream">+{rest}</span>
      )}
    </span>
  );
}
