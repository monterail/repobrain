---
name: knowledge-audit
description: Use when asked to audit the repo's knowledge layer, check for documentation drift, find orphaned documents, or review how often the no-decision label is being used. Reports problems that CI gates deliberately do not block on.
---

# Audyt warstwy wiedzy

Bramki CI łapią pojedyncze zdarzenia. Ten audyt łapie dryf systemowy — rzeczy,
których blokowanie dałoby fałszywe alarmy.

## Zakres

**1. Zgubione decyzje.** Dla każdego `Transcripts/*.md` z sekcją „Decyzje"
sprawdź, czy istnieje wpis DEC z `Źródło:` wskazującym na ten plik. Brak = ostrzeżenie,
nie błąd — nie każda decyzja z callu zasługuje na wpis.

**2. Użycia furtki.** Policz PR-y z etykietą `no-decision` z ostatnich 30 dni:

```bash
gh pr list --label no-decision --state all --limit 100 \
  --json number,title,mergedAt,author
```

Rosnąca liczba oznacza, że ścieżki decyzyjne są za szerokie albo bramka jest obchodzona.
Zaraportuj liczbę i listę — to jedyna obrona przed cichym znormalizowaniem furtki.

**3. Dokumenty bez odsyłaczy.** Pliki w `docs/`, do których nic w repo nie linkuje:

```bash
git ls-files 'docs/*' | grep -E '\.(md|html)$' | while read -r f; do
  n=$(grep -rl --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next --exclude-dir=coverage -F "$(basename "$f")" . | sed 's|^\./||' | (grep -Fxv "$f" || true) | wc -l | xargs)
  [ "$n" = 0 ] && echo "$f"
done
```

Raportuj listę do przejrzenia. Nie proponuj hurtowego kasowania — część to legalne archiwum.

**4. Martwe linki wewnętrzne.** Odsyłacze w `docs/`, które się nie rozwiązują.
Świadomie poza bramką CI: część to ścieżki względne rozwiązywane z innych katalogów,
więc blokowanie dawałoby fałszywe alarmy.

## Format raportu

Sekcje wyżej, każde znalezisko z ustaloną wagą (`błąd` / `ostrzeżenie` / `do przejrzenia`)
i konkretną ścieżką. Bez propozycji zmian, dopóki użytkownik o nie nie poprosi.
