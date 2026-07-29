---
name: decisions-format
description: Use when writing or editing an entry in docs/DECISIONS.md, when recording a project decision, or when a decision changes or reverses an earlier one. Defines the DEC entry format that repoBrain's CI gates validate.
---

# Format wpisu DEC

Wpisy żyją w `docs/DECISIONS.md`. Bramka CI `integrity` odrzuca każdy nagłówek `## `,
który nie jest kompletnym wpisem — nie ma cichego pomijania.

## Szablon

```markdown
## DEC-NNN — YYYY-MM-DD
**Odwraca:** DEC-XXX      (opcjonalne — XXX przestaje obowiązywać w całości)
**Zmienia:** DEC-XXX      (opcjonalne — XXX obowiązuje dalej, ten wpis doprecyzowuje fragment)
**Obszar:** tag, tag      (opcjonalne)
**Scope:** w cenie        (opcjonalne — w cenie | change request | do wyceny)
**Źródło:** Transcripts/YYYY-MM-DD-slug.md   (opcjonalne; wymagane dla decyzji klienta)
**Temat:** jedno zdanie
**Kontekst:** dlaczego temat się pojawił
**Decyzja:** co ustalono
**Konsekwencje:** co to zmienia w kodzie, kosztach, harmonogramie
**Podjął:** kto i gdzie
```

## Reguły twarde

- Wymagane pola: `Temat`, `Kontekst`, `Decyzja`, `Konsekwencje`, `Podjął`.
- Data ściśle `YYYY-MM-DD` z zerami wiodącymi. Separator `-`, `–` lub `—`.
- `Scope:` przyjmuje wyłącznie `w cenie`, `change request`, `do wyceny`.
- **Nigdy nie dopisuj pola `Status:`** — status wynika z relacji i jest wyliczany.
- Nowy wpis dopisuj **na końcu pliku**.
- Nigdy nie edytuj bloku `WYGENEROWANE:decyzje` w `CLAUDE.md`. Uruchom `node <SCIEZKA_DO_KITU>/bin/knowledge.mjs index`.

## Placeholdery blokujące CI

Poniższe ciągi blokują cały plik. Nie używaj ich jako świadomych znaczników roboczych:

```
[data]   [uzupełnij]   [TBD]   [verify]   TODO
```

Jeśli w momencie tworzenia wpisu czegoś jeszcze nie wiadomo, lepiej nie commitować wpisu wcale niż commitować niepełny.

## Którą relację wybrać

| Sytuacja | Pole |
|---|---|
| Poprzednia decyzja przestaje obowiązywać w całości | `Odwraca:` |
| Poprzednia obowiązuje dalej, doprecyzowujesz fragment | `Zmienia:` |
| Temat niezwiązany z żadną wcześniejszą | żadne |

Wpis nie może deklarować obu relacji naraz. Relacja musi wskazywać na wpis wcześniejszy
wg pary (data, numer ID).

Przy wątpliwości między `Odwraca:` a `Zmienia:` zadaj pytanie: *czy po tej zmianie
ktokolwiek nadal działa według starego wpisu?* Jeśli tak — `Zmienia:`.

## Po edycji

Uruchom `node <SCIEZKA_DO_KITU>/bin/knowledge.mjs index` i zacommituj `CLAUDE.md` razem z `DECISIONS.md`. Bez tego
bramka `index-fresh` zablokuje merge.
