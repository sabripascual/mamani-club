import { Avatar } from "@/components/ui/avatar";
import { displayName, initials } from "@/lib/utils";
import type { MemberWithAvatar } from "@/lib/admin/queries";

export function MemberIdentity({ m }: { m: MemberWithAvatar }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar src={m.avatar_url} initials={initials(m)} />
      <div className="min-w-0">
        <p className="truncate font-semibold">
          {m.first_name} {m.last_name}
          {m.nickname && <span className="font-normal text-graphite/55"> · {displayName(m)}</span>}
        </p>
        <p className="truncate text-sm text-graphite/55">@{m.username}</p>
      </div>
    </div>
  );
}
