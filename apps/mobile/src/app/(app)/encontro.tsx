import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addMonthsToKey, buildMoneyDate, categoryName, formatBrDayMonth, formatMonthLong, formatMonthShort, MAX_AGREEMENT_LENGTH, MAX_AGREEMENTS, MONEY_DATE_MINUTES, MONEY_DATE_STEPS,
  moneyDateText, nextMoneyDate, normalizeAgreements, previousAgreements, statementMonthKey, suggestAfterDay, WEEKDAY_LONG, type MoneyDate,
} from "@financas/core";
import { lastDueDate, MoneyDateReminderCard } from "@/components/MoneyDate";
import { Badge, Banner, Body, Button, Card, Empty, ErrorText, Hero, HeroPill, Loading, Money, Row, Screen, Segmented, Small, Stat } from "@/components/ui";
import { budgetsFor, latestStatementMonth, useAnalysis } from "@/lib/analysis";
import { useLoad } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { fetchMoneyDates, saveMoneyDate, scheduleCancelReminder, setAutoAfterDay, unscheduleCancelReminder, useMoneyDatePrefs, type CancelItem } from "@/lib/money-date";
import { saveBudget } from "@/lib/mutations";
import { fetchGoals, fetchSettings } from "@/lib/phase3";
import { fetchPlanned } from "@/lib/planned";
import { useReady } from "@/lib/session";
import { categoryColor, radius, space, useTheme } from "@/lib/theme";
import { localToday } from "@/lib/today";

const INTRO = -1;
const DONE = MONEY_DATE_STEPS.length;

/** Encontro do dinheiro: o check-in do mês como roteiro guiado de ~20 min, um passo por tela. */
export default function Encontro() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { householdId, user } = useReady();
  const analysis = useAnalysis();
  const planned = useLoad(fetchPlanned);
  const goals = useLoad(fetchGoals);
  const settings = useLoad(fetchSettings);
  const history = useLoad(fetchMoneyDates);
  const reminder = useMoneyDatePrefs();
  const today = localToday();
  const scroll = useRef<ScrollView>(null);

  const [step, setStep] = useState(INTRO);
  const [agreements, setAgreements] = useState<string[]>(["", "", ""]);
  const [toCancel, setToCancel] = useState<Map<string, CancelItem>>(new Map());
  const [budgetDone, setBudgetDone] = useState<Map<number, "kept" | "raised">>(new Map());
  const [prefilled, setPrefilled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const month = analysis.data ? latestStatementMonth(analysis.data) : undefined;
  const due = analysis.data ? lastDueDate(analysis.data) : null;
  useEffect(() => {
    if (due) setAutoAfterDay(suggestAfterDay(due));
  }, [due]);

  const md = useMemo<MoneyDate | null>(() => {
    const a = analysis.data;
    if (!a || !month) return null;
    const st = a.statements.find((s) => s.status === "confirmed" && statementMonthKey(s.due_date) === month);
    return buildMoneyDate({
      month,
      txs: a.txs,
      budgets: budgetsFor(a.budgetRows, month),
      annuity: st ? { installmentCents: st.annuity_cents, paidCents: st.annuity_paid_cents, discountPercent: st.annuity_discount_percent } : null,
      planned: planned.data ?? [],
      goals: goals.data ?? [],
      today,
      incomeCents: settings.data?.monthlyIncomeCents ?? 0,
    });
  }, [analysis.data, month, planned.data, goals.data, settings.data, today]);

  const current = history.data && month ? history.data.find((r) => r.month === month) : undefined;
  const previous = history.data && month ? previousAgreements(history.data, month) : null;

  // retoma o que já foi salvo para este mês (combinados e cancelamentos), uma vez
  if (!prefilled && history.data && month) {
    setPrefilled(true);
    if (current) {
      setAgreements([...current.agreements, "", "", ""].slice(0, MAX_AGREEMENTS));
      setToCancel(new Map(current.toCancel.map((c) => [c.key, c])));
    }
  }

  const go = (n: number) => {
    setError(null);
    setStep(n);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  if ((analysis.loading && !analysis.data) || (history.loading && !history.data)) return <Screen><Loading /></Screen>;
  if (!md) {
    return (
      <Screen>
        {analysis.error ? <ErrorText message={analysis.error} /> : null}
        <Empty title="Ainda sem fatura confirmada" hint="Confirme a fatura do mês para montar a pauta do encontro." />
        <Button title="Importar fatura" onPress={() => router.push("/importar")} />
      </Screen>
    );
  }

  async function finish() {
    if (!md) return;
    setBusy(true);
    setError(null);
    try {
      await saveMoneyDate(householdId, user.id, md.month, { agreements, toCancel: [...toCancel.values()], complete: true });
      setAgreements([...normalizeAgreements(agreements), "", "", ""].slice(0, MAX_AGREEMENTS));
      void history.reload();
      go(DONE);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleCancel(item: CancelItem, cancel: boolean) {
    const next = new Map(toCancel);
    if (cancel) {
      next.set(item.key, item);
      void scheduleCancelReminder(item, today);
    } else {
      next.delete(item.key);
      void unscheduleCancelReminder(item.key);
    }
    setToCancel(next);
  }

  async function adjustBudget(categoryId: number, limitCents: number | null) {
    if (!md) return;
    setError(null);
    try {
      if (limitCents !== null) {
        await saveBudget(householdId, categoryId, md.nextMonth, limitCents);
        void analysis.reload();
      }
      setBudgetDone(new Map(budgetDone).set(categoryId, limitCents === null ? "kept" : "raised"));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const info = step >= 0 && step < DONE ? MONEY_DATE_STEPS[step]! : null;
  const nextDate = nextMoneyDate(today, reminder.schedule);
  const cancelList = [...toCancel.values()];

  let body: ReactNode = null;
  if (step === INTRO) {
    body = (
      <>
        <Hero label={`Fatura de ${formatMonthLong(md.month)}`} value={`${MONEY_DATE_MINUTES} min a dois`}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            <HeroPill>{`${MONEY_DATE_STEPS.length} passos`}</HeroPill>
            {current?.completedAt ? <HeroPill>{`Feito em ${formatBrDayMonth(current.completedAt.slice(0, 10))}`}</HeroPill> : null}
          </View>
        </Hero>
        <Card style={{ paddingVertical: 4 }}>
          {MONEY_DATE_STEPS.map((s, i) => (
            <Row key={s.id} last={i === MONEY_DATE_STEPS.length - 1} onPress={() => go(i)}>
              <StepDot n={i + 1} />
              <Body style={{ flex: 1 }}>{s.title}</Body>
              <Small>{s.minutes} min</Small>
            </Row>
          ))}
        </Card>
        {previous ? <PreviousAgreements month={previous.month} items={previous.agreements} /> : null}
        <MoneyDateReminderCard />
        <Button title="Ver resumo do mês" variant="ghost" onPress={() => router.push("/checkin")} />
      </>
    );
  } else if (step === DONE) {
    const saved = normalizeAgreements(agreements);
    body = (
      <>
        <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.lg }}>
          <Ionicons name="checkmark-circle" size={64} color={t.success} />
          <Text style={{ color: t.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.4 }}>Encontro concluído</Text>
          <Body muted>Próximo: {WEEKDAY_LONG[reminder.schedule.weekday]}, {formatBrDayMonth(nextDate)}</Body>
        </View>
        {saved.length > 0 ? (
          <Card>
            <Small>COMBINADOS</Small>
            {saved.map((a) => <Bullet key={a}>{a}</Bullet>)}
          </Card>
        ) : null}
        {cancelList.length > 0 ? (
          <Card>
            <Small>CANCELAR</Small>
            {cancelList.map((c) => (
              <View key={c.key} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                <Body style={{ flex: 1 }} numberOfLines={1}>{c.label}</Body>
                <Money cents={c.cents} color={t.success} />
              </View>
            ))}
          </Card>
        ) : null}
        <MoneyDateReminderCard />
        <Button title="Compartilhar" variant="secondary" onPress={() => void Share.share({ message: moneyDateText(md, saved, cancelList, nextDate) })} />
      </>
    );
  } else if (info?.id === "mes") {
    const o = md.overview;
    body = (
      <>
        <Hero label={`Total de ${formatMonthLong(md.month)}`} value={formatBRL(o.totalCents)}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {o.deltaPercent !== null ? <HeroPill>{`${o.deltaPercent === 0 ? "=" : o.deltaPercent > 0 ? "▲" : "▼"} ${Math.abs(o.deltaPercent)}% vs ${formatMonthShort(addMonthsToKey(md.month, -1))}`}</HeroPill> : null}
            {o.vsForecastCents !== null ? <HeroPill>{`${o.vsForecastCents > 0 ? "+" : ""}${formatBRL(o.vsForecastCents)} vs previsto`}</HeroPill> : null}
          </View>
        </Hero>
        <Card>
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Stat label="Mês anterior" value={o.prevTotalCents === null ? "—" : formatBRL(o.prevTotalCents)} />
            <Stat label="Previsto" value={o.forecastCents === null ? "—" : formatBRL(o.forecastCents)} />
            <Stat label="Diferença" value={o.vsForecastCents === null ? "—" : formatBRL(o.vsForecastCents)} tone={o.vsForecastCents === null ? undefined : o.vsForecastCents > 0 ? "warn" : "good"} />
          </View>
        </Card>
        {md.checkin.recommendations.length > 0 ? (
          <Banner tone="good" title={`Dá para economizar até ${formatBRL(md.checkin.estimatedSavingsCents)}/mês`}>
            <Small>{md.checkin.recommendations[0]!.title}</Small>
          </Banner>
        ) : null}
      </>
    );
  } else if (info?.id === "mudancas") {
    const { risers, fallers, newMerchants } = md.changes;
    body = risers.length + fallers.length + newMerchants.length === 0 ? (
      <Card><Empty title="Nada mudou muito" hint={md.overview.prevTotalCents === null ? "Primeira fatura: sem comparação." : undefined} /></Card>
    ) : (
      <>
        {risers.length + fallers.length > 0 ? (
          <Card>
            {[...risers, ...fallers].map((c) => (
              <View key={c.key} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Text style={{ color: c.diffCents > 0 ? t.warning : t.success, fontSize: 14, width: 16 }}>{c.diffCents > 0 ? "▲" : "▼"}</Text>
                <Body numberOfLines={1} style={{ flex: 1 }}>{c.label}</Body>
                <Money cents={c.diffCents} signed color={c.diffCents > 0 ? t.warning : t.success} />
              </View>
            ))}
          </Card>
        ) : null}
        {newMerchants.length > 0 ? (
          <Card>
            <Small>NOVOS ESTABELECIMENTOS</Small>
            {newMerchants.map((m) => (
              <View key={m.key} style={{ flexDirection: "row", gap: space.md }}>
                <Body numberOfLines={1} style={{ flex: 1 }}>{m.label}</Body>
                <Money cents={m.currentCents} />
              </View>
            ))}
          </Card>
        ) : null}
      </>
    );
  } else if (info?.id === "orcamento") {
    body = !md.budget.hasBudgets ? (
      <Card>
        <Empty title="Sem orçamento definido" hint="Um limite por categoria ajuda a conversa." />
        <Button title="Definir limites" variant="secondary" onPress={() => router.push("/orcamento")} />
      </Card>
    ) : md.budget.adjust.length === 0 ? (
      <Banner tone="good" title="Tudo dentro do limite"><Small>{md.budget.okCount} categorias no azul.</Small></Banner>
    ) : (
      <>
        {md.budget.adjust.map((b) => {
          const done = budgetDone.get(b.categoryId);
          return (
            <Card key={b.categoryId} style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: categoryColor(t, b.categoryId) }} />
                <Body numberOfLines={1} style={{ flex: 1, fontWeight: "600" }}>{categoryName(b.categoryId)}</Body>
                <Badge label={`${b.percent}%`} tone={b.level === "over100" ? "bad" : "warn"} />
              </View>
              <Bar percent={b.percent} color={b.level === "over100" ? t.danger : t.warning} />
              <Small>{formatBRL(b.spentCents)} de {formatBRL(b.limitCents)}</Small>
              {done ? (
                <Badge label={done === "raised" ? `Novo limite a partir de ${formatMonthShort(md.nextMonth)}` : "Limite mantido"} tone="good" />
              ) : (
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <View style={{ flex: 1 }}><Button title="Manter" small variant="secondary" onPress={() => void adjustBudget(b.categoryId, null)} /></View>
                  {b.suggestedLimitCents > b.limitCents ? (
                    <View style={{ flex: 1 }}><Button title={`Subir p/ ${formatBRL(b.suggestedLimitCents)}`} small onPress={() => void adjustBudget(b.categoryId, b.suggestedLimitCents)} /></View>
                  ) : null}
                </View>
              )}
            </Card>
          );
        })}
      </>
    );
  } else if (info?.id === "assinaturas") {
    const savings = cancelList.reduce((a, c) => a + c.cents, 0);
    body = md.subscriptions.items.length === 0 ? (
      <Card><Empty title="Nenhuma cobrança mensal detectada" /></Card>
    ) : (
      <>
        <Card>
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Stat label="Por mês" value={formatBRL(md.subscriptions.monthlyCents)} />
            <Stat label="Por ano" value={formatBRL(md.subscriptions.annualCents)} />
            <Stat label="A cancelar" value={savings > 0 ? `${formatBRL(savings)}/mês` : "—"} tone={savings > 0 ? "good" : undefined} />
          </View>
        </Card>
        {md.subscriptions.items.map((s) => {
          const marked = toCancel.has(s.key);
          return (
            <Card key={s.key} style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Body numberOfLines={1} style={{ flex: 1, fontWeight: "600" }}>{s.label}</Body>
                {s.alerts.includes("duplicada") ? <Badge label="Duplicada" tone="bad" /> : null}
                {s.alerts.includes("mudou_valor") ? <Badge label="Mudou" tone="warn" /> : null}
                <Money cents={s.typicalCents} bold />
              </View>
              <Segmented
                options={[{ value: "keep", label: "Manter" }, { value: "cancel", label: "Cancelar" }]}
                value={marked ? "cancel" : "keep"}
                onChange={(v) => toggleCancel({ key: s.key, label: s.label, cents: s.typicalCents }, v === "cancel")}
              />
              {marked ? <Small>Lembrete amanhã às 19h · {formatBRL(s.annualCents)}/ano</Small> : null}
            </Card>
          );
        })}
      </>
    );
  } else if (info?.id === "proximo") {
    const n = md.next;
    body = !n ? (
      <Card><Empty title="Sem previsão ainda" /></Card>
    ) : (
      <>
        <Hero label={`Previsto para ${formatMonthLong(n.monthKey)}`} value={formatBRL(n.totalCents)}>
          {n.netCents !== null ? <HeroPill>{`${n.netCents >= 0 ? "Sobra" : "Falta"} ${formatBRL(Math.abs(n.netCents))}`}</HeroPill> : null}
        </Hero>
        <Card>
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Stat label="Média do dia a dia" value={formatBRL(n.baselineCents)} />
            <Stat label="Gastos futuros" value={formatBRL(n.plannedCents)} />
          </View>
          {n.planned.map((o) => (
            <View key={`${o.id}-${o.date}`} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <View style={{ width: 48, paddingVertical: 4, borderRadius: 10, backgroundColor: t.surfaceAlt, alignItems: "center" }}>
                <Text style={{ color: t.text, fontWeight: "700", fontSize: 13, fontVariant: ["tabular-nums"] }}>{formatBrDayMonth(o.date)}</Text>
              </View>
              <Body numberOfLines={1} style={{ flex: 1 }}>{o.description}</Body>
              <Money cents={o.amountCents} bold />
            </View>
          ))}
        </Card>
        <Button title="Adicionar gasto futuro" variant="secondary" onPress={() => router.push("/planejado")} />
      </>
    );
  } else if (info?.id === "metas") {
    body = md.goals.length === 0 ? (
      <Card>
        <Empty title="Nenhuma meta ainda" hint="Viagem, reserva, quitar algo…" />
        <Button title="Criar meta" variant="secondary" onPress={() => router.push("/metas")} />
      </Card>
    ) : (
      <>
        {md.goals.map((g) => (
          <Card key={g.id} style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Body numberOfLines={1} style={{ flex: 1, fontWeight: "600" }}>{g.name}</Body>
              <Badge label={g.progress.status === "concluida" ? "Concluída" : g.progress.status === "atrasada" ? "Atrasada" : `${g.progress.percent}%`} tone={g.progress.status === "concluida" ? "good" : g.progress.status === "atrasada" ? "bad" : "neutral"} />
            </View>
            <Bar percent={g.progress.percent} color={t.success} />
            <Small>
              {formatBRL(g.savedCents)} de {formatBRL(g.targetCents)}
              {g.progress.monthlyNeededCents ? ` · guardar ${formatBRL(g.progress.monthlyNeededCents)}/mês` : ""}
            </Small>
          </Card>
        ))}
        <Button title="Atualizar metas" variant="ghost" onPress={() => router.push("/metas")} />
      </>
    );
  } else if (info?.id === "combinados") {
    const input = { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 14, fontSize: 16, color: t.text, backgroundColor: t.surface } as const;
    const room = agreements.findIndex((a) => !a.trim());
    body = (
      <>
        {previous ? (
          <PreviousAgreements
            month={previous.month}
            items={previous.agreements}
            onKeep={room >= 0 ? (a) => {
              if (agreements.some((x) => x.trim().toLocaleLowerCase("pt-BR") === a.toLocaleLowerCase("pt-BR"))) return;
              const next = [...agreements];
              next[room] = a;
              setAgreements(next);
            } : undefined}
          />
        ) : null}
        {agreements.map((a, i) => (
          <TextInput
            key={i}
            value={a}
            onChangeText={(v) => setAgreements(agreements.map((x, j) => (j === i ? v : x)))}
            placeholder={["Ex.: pedir menos iFood", "Ex.: mercado 1x por semana", "Ex.: revisar o plano do celular"][i]}
            placeholderTextColor={t.textMuted}
            maxLength={MAX_AGREEMENT_LENGTH}
            returnKeyType="done"
            accessibilityLabel={`Combinado ${i + 1}`}
            style={input}
          />
        ))}
        <Small>Ficam salvos para os dois e voltam no próximo encontro.</Small>
      </>
    );
  }

  const last = step === DONE - 1;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {info ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm }}>
          <Progress index={step} />
          <Text style={{ color: t.textMuted, fontSize: 13, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" }}>
            Passo {step + 1} de {MONEY_DATE_STEPS.length} · {info.minutes} min
          </Text>
        </View>
      ) : null}
      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
        {info ? (
          <View style={{ gap: 4 }}>
            <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: "800", letterSpacing: -0.6, color: t.text }}>{info.title}</Text>
            <Body muted>{info.prompt}</Body>
          </View>
        ) : null}
        {body}
        {error ? <ErrorText message={error} /> : null}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: Math.max(insets.bottom, space.md), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border, backgroundColor: t.bg }}>
        {step === INTRO ? (
          <View style={{ flex: 1 }}><Button title={current?.completedAt ? "Refazer o encontro" : "Começar"} onPress={() => go(0)} /></View>
        ) : step === DONE ? (
          <View style={{ flex: 1 }}><Button title="Voltar ao início" onPress={() => router.back()} /></View>
        ) : (
          <>
            <Button title="Voltar" variant="secondary" onPress={() => go(step - 1)} />
            <View style={{ flex: 1 }}>
              <Button title={last ? "Concluir encontro" : "Próximo"} loading={busy} onPress={() => (last ? void finish() : go(step + 1))} />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function Progress({ index }: { index: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4 }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: MONEY_DATE_STEPS.length, now: index + 1 }}>
      {MONEY_DATE_STEPS.map((s, i) => (
        <View key={s.id} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= index ? t.primaryFill : t.surfaceAlt }} />
      ))}
    </View>
  );
}

function Bar({ percent, color }: { percent: number; color: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surfaceAlt, overflow: "hidden" }}>
      <View style={{ width: `${Math.min(Math.max(percent, 0), 100)}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

function StepDot({ n }: { n: number }) {
  const t = useTheme();
  return (
    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: t.textSecondary, fontSize: 13, fontWeight: "700" }}>{n}</Text>
    </View>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
      <Ionicons name="checkmark" size={18} color={t.success} />
      <Body style={{ flex: 1 }}>{children}</Body>
    </View>
  );
}

function PreviousAgreements({ month, items, onKeep }: { month: string; items: string[]; onKeep?: (a: string) => void }) {
  return (
    <Card style={{ gap: space.sm }}>
      <Small>COMBINADOS DE {formatMonthShort(month).toUpperCase()}</Small>
      {items.map((a) => (
        <View key={a} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={{ flex: 1 }}><Bullet>{a}</Bullet></View>
          {onKeep ? <Button title="Manter" small variant="ghost" onPress={() => onKeep(a)} /> : null}
        </View>
      ))}
    </Card>
  );
}
