// Excluir a conta e os dados (direito de eliminação). Sem dependência de Deno/Supabase: tudo entra por `AccountStore`.
//
// Ordem importa:
//   1. quem é a única pessoa do casal: apaga os ARQUIVOS (Storage), depois o casal (cascata no banco);
//   2. quem tem par: só sai do casal (o par fica com o histórico; gastos pessoais de quem sai são apagados);
//   3. por último, apaga o usuário. Se algo falhar antes, o usuário NÃO é apagado e dá para tentar de novo.

export interface AccountStore {
  me(): Promise<{ userId: string; household: { id: string; name: string } | null }>;
  /** Quantas pessoas há no casal (visão do próprio usuário). */
  memberCount(householdId: string): Promise<number>;
  /** Remove os arquivos do casal nos buckets privados (chave de serviço). Devolve quantos. */
  purgeFiles(householdId: string): Promise<number>;
  /** RPC leave_household, como o usuário. */
  leave(): Promise<void>;
  /** RPC delete_household, como o usuário. */
  deleteHousehold(confirmName: string): Promise<void>;
  /** auth.admin.deleteUser (chave de serviço). */
  deleteAuthUser(userId: string): Promise<void>;
}

export interface DeleteAccountResult {
  status: "ok";
  householdDeleted: boolean;
  filesPurged: number;
}

export async function deleteAccount(store: AccountStore): Promise<DeleteAccountResult> {
  const me = await store.me();
  let householdDeleted = false;
  let filesPurged = 0;

  if (me.household) {
    const members = await store.memberCount(me.household.id);
    if (members <= 1) {
      filesPurged = await store.purgeFiles(me.household.id);
      await store.deleteHousehold(me.household.name);
      householdDeleted = true;
    } else {
      await store.leave();
    }
  }
  await store.deleteAuthUser(me.userId);
  return { status: "ok", householdDeleted, filesPurged };
}
