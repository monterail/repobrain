---
description: Wyciągnij z transkryptu decyzje, niepewności i zadania; rozwieź je do właściwych miejsc
argument-hint: <ścieżka do transkryptu>
allowed-tools: Read, Write, Edit, Bash
---

Przetwórz transkrypt: **$ARGUMENTS**

## Krok 1 — przeczytaj i podsumuj

Zapisz podsumowanie do `Transcripts/YYYY-MM-DD-slug.md` (datę weź z nazwy pliku
lub treści). Katalog utwórz, jeśli nie istnieje. Szablon:

```markdown
# Podsumowanie — [data] — [temat]

**Typ:** klient / wewnętrzne / discovery / vendor
**Uczestnicy:** …
**Język:** PL / EN

## Kontekst
[1-2 zdania: po co było to spotkanie]

## Decyzje
| # | Decyzja | Kto | Uwagi |
|---|---------|-----|-------|

## Zadania
| Zadanie | Kto | Termin | Priorytet |
|---------|-----|--------|-----------|

## Otwarte pytania
- …

## Cytaty
> "[dokładny cytat]" — [kto]
```

Nie zmyślaj. Cokolwiek niejasne oznacz `[verify]` i zgłoś użytkownikowi —
bramka `integrity` odrzuci `[verify]`, który zostanie w `DECISIONS.md`.

## Krok 2 — sklasyfikuj według trwałości

Kryterium routingu to **cykl życia pozycji**, nie jej typ. Decyzja obowiązuje,
aż ktoś ją odwróci; zadanie umiera po wykonaniu.

| Typ | Cel |
|---|---|
| Decyzja | draft wpisu DEC → `docs/DECISIONS.md` |
| Niepewność, założenie | `HYPOTHESES.md` |
| Zadanie | lista do wklejenia w Jirę — **nie do repo** |
| Cytat | zostaje w podsumowaniu jako dowód |

Zadania nie trafiają do repo: jako listy TODO w `docs/` nikt ich nie zamyka.

## Krok 3 — przygotuj drafty wpisów DEC

Format wg skilla `decisions-format`. W każdym drafcie ustaw `Źródło:` na plik
podsumowania z kroku 1. Gdy decyzję podjął klient, `Źródło:` jest wymagane.
Ustaw `Scope:`, jeśli z rozmowy wynika, czy rzecz jest w cenie.

Jeśli decyzja modyfikuje wcześniejszą — dobierz `Odwraca:` albo `Zmienia:` wg pytania:
*czy ktokolwiek nadal działa według starego wpisu?*

**Pokaż drafty w odpowiedzi — nie zapisuj ich na dysk.** Zapis następuje dopiero po akceptacji użytkownika w Kroku 4.

## Krok 4 — pokaż i poczekaj

**Nie zapisuj niczego poza podsumowaniem z kroku 1 bez zgody użytkownika.**
Pokaż drafty, zapytaj, które zastosować. Po akceptacji dopisz je na końcu
`docs/DECISIONS.md`, uruchom `npx --yes github:monterail/repobrain#<PELNY_SHA> index`
i pokaż, co się zmieniło.
