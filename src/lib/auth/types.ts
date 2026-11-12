export type MemberRole = "admin" | "member";
export type MemberStatus = "pending" | "active" | "inactive" | "rejected";

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  nickname: string | null;
  avatar_path: string | null;
  role: MemberRole;
  status: MemberStatus;
  joined_at: string | null;
  created_at: string;
  must_change_password: boolean;
};

export const PROFILE_COLUMNS =
  "id, first_name, last_name, username, nickname, avatar_path, role, status, joined_at, created_at, must_change_password";
