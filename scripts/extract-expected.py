#!/usr/bin/env python3
"""Extrai os totais declarados de uma fatura Santander a partir do texto do PDF
(pdftotext -layout), por um caminho independente do leitor em TypeScript.
Usado para gerar fixtures/santander/expected/*.json e conferir o leitor.

Uso: python3 -I scripts/extract-expected.py fatura.pdf  > expected.json
"""
import json, re, subprocess, sys

def brl(s):
    s = s.strip().replace("R$", "").replace(" ", "")
    neg = s.startswith("-")
    s = s.lstrip("-").replace(".", "").replace(",", ".")
    cents = round(float(s) * 100)
    return -cents if neg else cents

txt = subprocess.run(["pdftotext", "-layout", sys.argv[1], "-"], capture_output=True, text=True, check=True).stdout

def money_after(label):
    m = re.search(label + r"[^\n]*?(-?[\d.]+,\d{2})(?:\s+(-?[\d.]+,\d{2}))?\s*$", txt, re.M)
    return (brl(m.group(1)), brl(m.group(2)) if m.group(2) else None) if m else (None, None)

def right_of(label):
    # O texto em layout mistura as duas colunas na mesma linha; os valores do resumo
    # vêm DEPOIS do rótulo, então só olhamos o que está à direita dele.
    for line in txt.splitlines():
        m = re.search(label + r"(.*)$", line)
        if m:
            nums = re.findall(r"-?\d{1,3}(?:\.\d{3})*,\d{2}", m.group(1))
            if nums:
                return nums
    return []

total = re.search(r"Total a Pagar.*?\n.*?R\$\s?([\d.]+,\d{2})\s+(\d{2}/\d{2}/\d{4})", txt, re.S)
period = re.search(r"Esta Fatura\s+(\d{2}/\d{2}/\d{2}) a (\d{2}/\d{2}/\d{2})", txt)
future = re.search(r"obriga[çc][õo]es futuras.*?Compras parceladas[^\n]*?([\d.]+,\d{2})", txt, re.S)

def one(label, idx=0):
    nums = right_of(label)
    return brl(nums[idx]) if len(nums) > idx else None

out = {
    "totalDueCents": brl(total.group(1)),
    "dueDate": "-".join(reversed(total.group(2).split("/"))),
    "closingDate": "20" + period.group(2)[6:8] + "-" + period.group(2)[3:5] + "-" + period.group(2)[0:2],
    "previousBalanceCents": one(r"Saldo Anterior"),
    "domesticExpensesCents": one(r"Total Despesas/D.bitos no Brasil"),
    "foreignExpensesCents": one(r"Total Despesas/D.bitos no Exterior"),
    "foreignExpensesUsdCents": one(r"Total Despesas/D.bitos no Exterior", 1) or 0,
    "paymentsCents": one(r"Total de pagamentos"),
    "creditsCents": one(r"Total de cr.ditos"),
    "balanceCents": one(r"Saldo Desta Fatura"),
    "futureObligationsCents": brl(future.group(1)),
}
print(json.dumps(out, indent=2))
