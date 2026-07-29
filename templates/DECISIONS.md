# Decision Log

Jedno źródło prawdy o decyzjach projektu. Skrót aktywnych decyzji generuje się
z tego pliku do `CLAUDE.md` — nie edytuj go tam ręcznie.

### Format wpisu

Nagłówek tej sekcji jest celowo trzeciego poziomu: każdy nagłówek `## ` w tym pliku
musi być kompletnym wpisem DEC, inaczej bramka `integrity` odrzuca plik.

```markdown
## DEC-NNN — YYYY-MM-DD
**Odwraca:** DEC-XXX      (opcjonalne — XXX przestaje obowiązywać w całości)
**Zmienia:** DEC-XXX      (opcjonalne — XXX obowiązuje dalej, ten wpis doprecyzowuje fragment)
**Obszar:** tag, tag      (opcjonalne)
**Scope:** w cenie        (opcjonalne — w cenie | change request | do wyceny)
**Źródło:** Transcripts/YYYY-MM-DD-slug.md   (opcjonalne; wymagane dla decyzji klienta)
**Temat:** jedno zdanie
**Kontekst:** dlaczego temat w ogóle się pojawił
**Decyzja:** co ustalono
**Konsekwencje:** co to zmienia w kodzie, kosztach, harmonogramie
**Podjął:** kto i gdzie
```

**Ograniczenia relacji:**

- `Odwraca:` i `Zmienia:` **się wzajemnie wykluczają** — wpis może mieć co najwyżej jedną z tych relacji, nigdy obie naraz. Jeśli zmiana dotyczy dwóch wcześniejszych decyzji, potrzebne są dwa wpisy.
- Cel relacji (zarówno `Odwraca:` jak i `Zmienia:`) musi wskazywać na **wcześniejszy wpis** (wcześniejsza data, lub przy równej dacie — mniejszy numer ID).

**Placeholdery blokujące CI:**

Poniższe ciągi blokują cały plik. Nie używaj ich jako świadomych znaczników roboczych:

```
[data]   [uzupełnij]   [TBD]   [verify]   TODO
```

Jeśli w momencie tworzenia wpisu czegoś jeszcze nie wiadomo, lepiej nie commitować wpisu wcale niż commitować niepełny.

Zasady:

- Nowe wpisy dopisuj **na końcu pliku** — dzięki temu równoległe PR-y dają konflikt tekstowy zamiast cichego auto-merge.
- Statusu się nie zapisuje. Wynika z pól `Odwraca:` i `Zmienia:` późniejszych wpisów.
- Zmiana merytoryczna = nowy wpis. Edycja korygująca (literówka, data, dopisanie `Źródło:`) jest dozwolona w miejscu.

---

## DEC-001 — 2026-01-01
**Obszar:** proces
**Temat:** Decyzje projektu żyją w tym pliku
**Kontekst:** Wiedza rozproszona po Slacku i transkryptach nie przeżywa rotacji w zespole.
**Decyzja:** Każda decyzja mająca wpływ na zakres, koszt lub architekturę trafia tutaj jako wpis DEC.
**Konsekwencje:** CI blokuje PR-y w ścieżkach decyzyjnych bez wpisu. Skrót aktywnych decyzji generuje się do CLAUDE.md.
**Podjął:** Zespół — instalacja repoBrain
