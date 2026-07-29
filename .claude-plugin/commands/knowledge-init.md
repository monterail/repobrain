---
description: Zainstaluj repoBrain w bieżącym repo — DECISIONS.md, workflow CI, sekcja w CLAUDE.md
allowed-tools: Bash, Read, Edit
---

Zainstaluj repoBrain w tym repozytorium.

## Krok 1 — uruchom instalator

```bash
npx --yes github:monterail/repobrain#<PELNY_SHA> init
```

Instalator nigdy nie nadpisuje istniejących plików. Raportuje, co dołożył (`+`),
a co pominął (`=`).

## Krok 2 — uzupełnij to, czego instalator nie mógł zgadnąć

1. **Ścieżki decyzyjne** w `.github/workflows/knowledge.yml`. Zacznij wąsko —
   `docs/specs/**` i pliki cenowe. Nie dodawaj katalogu migracji na starcie: większość
   migracji nie ma za sobą decyzji klienckiej, a złapanie ich zamieni etykietę
   `no-decision` w odruch.
2. **Pełny SHA** repoBrain w tym samym pliku. Nigdy tag — tagi gita są mutowalne,
   a to zdalny kod wykonywany w CI.
3. **Branch protection**: „require branches to be up to date before merging". Bez tego
   dwa PR-y mogą dodać ten sam numer DEC i auto-zmergować się, psując `main`.
4. **Nazwiska klienta** we fladze `--client-names` w tym samym pliku. Bez tego bramka
   `integrity` nigdy nie wymaga pola `Źródło:` dla decyzji podjętych przez klienta —
   reguła jest w kodzie, ale milczy.

## Krok 3 — pierwsza generacja

```bash
npx --yes github:monterail/repobrain#<PELNY_SHA> index
```

Zacommituj `docs/DECISIONS.md` i `CLAUDE.md` razem.

## Krok 4 — zaraportuj użytkownikowi

Co powstało, co zostało pominięte i które z czterech uzupełnień z kroku 2 nadal czekają.
