import { supabase } from "./supabase";

export interface NotifyResponse {
  status?: string;
  month?: string;
  alerts?: { categoryId: number; level: "warn80" | "over100"; percent: number; title: string; body: string }[];
  pushSent?: number;
}

async function call(body: { statementId?: string; txId?: string }): Promise<NotifyResponse | null> {
  try {
    const { data, error } = await supabase.functions.invoke<NotifyResponse>("notify", { body });
    return error ? null : data;
  } catch {
    return null; // avisos são melhor esforço: nunca desfazem a ação
  }
}

export const notifyStatement = (statementId: string) => call({ statementId });
export const notifyTx = (txId: string) => call({ txId });
