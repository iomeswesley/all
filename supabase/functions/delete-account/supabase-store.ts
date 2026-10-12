import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountStore } from "./process.ts";

const BUCKETS = ["statements", "receipts"] as const;

function ok<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

/**
 * `user` = cliente com o JWT da pessoa (a RLS vale; faz as RPCs).
 * `admin` = cliente com a chave de serviço, usado SÓ para apagar arquivos e o usuário, depois do JWT verificado.
 */
export function accountSupabaseStore(user: SupabaseClient, admin: SupabaseClient, userId: string): AccountStore {
  return {
    async me() {
      const rows = ok(await user.from("members").select("household_id").eq("user_id", userId).limit(1), "members");
      const hid = rows?.[0]?.household_id as string | undefined;
      if (!hid) return { userId, household: null };
      const h = ok(await user.from("households").select("name").eq("id", hid).limit(1), "households");
      return { userId, household: { id: hid, name: (h?.[0]?.name as string | undefined) ?? "" } };
    },
    async memberCount(householdId) {
      const rows = ok(await user.from("members").select("user_id").eq("household_id", householdId), "members");
      return rows?.length ?? 0;
    },
    async purgeFiles(householdId) {
      let removed = 0;
      for (const bucket of BUCKETS) {
        for (;;) {
          const { data, error } = await admin.storage.from(bucket).list(householdId, { limit: 100 });
          if (error) throw new Error(`storage ${bucket}: ${error.message}`);
          if (!data || data.length === 0) break;
          const paths = data.map((f) => `${householdId}/${f.name}`);
          const res = await admin.storage.from(bucket).remove(paths);
          if (res.error) throw new Error(`storage ${bucket}: ${res.error.message}`);
          removed += paths.length;
        }
      }
      return removed;
    },
    async leave() {
      const { error } = await user.rpc("leave_household");
      if (error) throw new Error(`leave_household: ${error.message}`);
    },
    async deleteHousehold(confirmName) {
      const { error } = await user.rpc("delete_household", { p_confirm_name: confirmName });
      if (error) throw new Error(`delete_household: ${error.message}`);
    },
    async deleteAuthUser(id) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error(`deleteUser: ${error.message}`);
    },
  };
}
