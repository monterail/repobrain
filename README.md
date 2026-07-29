# repoBrain

Warstwa wiedzy dla projektów klienckich, trzymana w repo i egzekwowana przez CI.

Jedno źródło prawdy (`docs/DECISIONS.md`), z którego generowany jest skrót aktywnych decyzji
wprost do `CLAUDE.md`. Rozjazd między nimi jest niemożliwy dłużej niż jeden PR, bo bramka CI
regeneruje i porównuje — tak jak check lockfile'a.

Dystrybucja dwiema ścieżkami z jednego repo: **plugin Claude Code** (skille + komendy dla zespołu)
oraz **CLI przez `npx`** (bramki w GitHub Actions, bez zależności od Claude Code).

---

## Spis treści

1. [Skąd to się wzięło](#1-skąd-to-się-wzięło)
2. [Model: źródło kontra derywata](#2-model-źródło-kontra-derywata)
3. [Co ręczne, co automatyczne — tabela zbiorcza](#3-co-ręczne-co-automatyczne--tabela-zbiorcza)
4. [Instalacja](#4-instalacja)
5. [Jak powstaje dokumentacja — trzy ścieżki](#5-jak-powstaje-dokumentacja--trzy-ścieżki)
6. [Format wpisu DEC](#6-format-wpisu-dec)
7. [Status jest wyliczany, nie zapisywany](#7-status-jest-wyliczany-nie-zapisywany)
8. [Bramki CI](#8-bramki-ci)
9. [Komendy CLI](#9-komendy-cli)
10. [Rytm pracy i właściciel](#10-rytm-pracy-i-właściciel)
11. [Czego repoBrain nie robi](#11-czego-repobrain-nie-robi)
12. [Rozwój kitu](#12-rozwój-kitu)

---

## 1. Skąd to się wzięło

Z audytu warstwy wiedzy w zakończonym projekcie klienckim: pięć równoległych magazynów,
ręcznie utrzymywane kopie rozjechały się ze źródłem, a hook synchronizujący commitował cudzą
pracę pod fałszywym komunikatem. Wspólna przyczyna wszystkich defektów była jedna —
**kopia utrzymywana ręcznie zawsze się rozjedzie**. repoBrain zastępuje kopie derywatą.

Z tego wynika cały układ narzędzia:

- kopii się nie utrzymuje — kopię się **generuje** i porównuje w CI,
- statusu decyzji się nie zapisuje — status **wynika** z relacji między wpisami,
- automat nie pisze do repo bez człowieka — bo to była przyczyna defektu, nie jego lekarstwo.

---

## 2. Model: źródło kontra derywata

To jest podział, z którego wynika wszystko poniżej.

```
┌─ ŹRÓDŁO (człowiek pisze, review w PR) ──────────────────────┐
│                                                              │
│  docs/DECISIONS.md      pełna treść decyzji                  │
│  Transcripts/*.md       podsumowania spotkań (dowód)         │
│  HYPOTHESES.md          niepewności do rozstrzygnięcia       │
│  docs/specs/            kontrakt implementacyjny             │
│                                                              │
└──────────────────────────┬───────────────────────────────────┘
                           │   npx … index
                           ▼
┌─ DERYWATA (maszyna generuje, NIKT nie edytuje ręcznie) ─────┐
│                                                              │
│  CLAUDE.md → blok <!-- WYGENEROWANE:decyzje -->              │
│              tabela aktywnych decyzji + lista odwróconych    │
│                                                              │
└──────────────────────────┬───────────────────────────────────┘
                           │   npx … check  (bramka index-fresh)
                           ▼
              rozjazd = czerwony PR, nie da się zmergować
```

Reguła pierwszeństwa, którą instalator dopisuje do `CLAUDE.md`:

1. `docs/DECISIONS.md` — pełna treść; `Odwraca:`/`Zmienia:` rozstrzygają aktualność
2. blok `WYGENEROWANE:decyzje` — skrót aktywnych, zawsze zgodny z (1)
3. `docs/specs/` — kontrakt implementacyjny
4. `Transcripts/` — materiał dowodowy, gdy 1–3 milczą

**Wszystko poza tą listą to notatki robocze, nie źródło prawdy.**

---

## 3. Co ręczne, co automatyczne — tabela zbiorcza

| Czynność | Kto | Kiedy |
|---|---|---|
| Napisanie wpisu DEC | **człowiek** (agent proponuje draft) | przy każdej decyzji zakresowej, kosztowej lub architektonicznej |
| Podsumowanie transkryptu | agent (`/transcript-extract`) | po callu z klientem |
| Wybór, które drafty DEC zastosować | **człowiek** | krok 4 `/transcript-extract` |
| Wybór `Odwraca:` vs `Zmienia:` | **człowiek** | gdy decyzja dotyka wcześniejszej |
| Wyliczenie statusu (aktywna / odwrócona) | maszyna (`lib/status.mjs`) | przy każdym `index` i `check` |
| Wygenerowanie tabeli w `CLAUDE.md` | maszyna (`npx … index`) | po każdej edycji `DECISIONS.md` |
| Uruchomienie `index` | **człowiek** (lokalnie, przed commitem) | po edycji `DECISIONS.md` |
| Sprawdzenie, czy `CLAUDE.md` jest świeży | maszyna (bramka `index-fresh`) | każdy PR i push na `main` |
| Sprawdzenie kompletności wpisów | maszyna (bramka `integrity`) | każdy PR i push na `main` |
| Przypomnienie „ta zmiana wymaga decyzji" | maszyna (bramka `decision-required`) | PR ruszający ścieżki decyzyjne |
| Reakcja na czerwoną bramkę | **człowiek** | dopisuje wpis albo etykietę `no-decision` |
| Audyt dryfu systemowego | agent (`/knowledge-audit`) | raz na sprint, uruchamiany ręcznie |
| Rozszerzenie ścieżek decyzyjnych | **człowiek** (właściciel) | gdy audyt pokaże, że furtka się normalizuje |

**Zasada nadrzędna:** żadne narzędzie w tym kicie nie zapisuje do `docs/DECISIONS.md`
bez jawnej akceptacji człowieka. Jedyny plik, który agent zapisuje samodzielnie, to
podsumowanie transkryptu w `Transcripts/` — archiwum, nie źródło decyzji.

---

## 4. Instalacja

### Krok 1 — uruchom instalator

```bash
npx --yes github:monterail/repobrain#<PELNY_SHA> init
```

albo, z pluginem Claude Code: `/knowledge-init`.

Instalator **nigdy nie nadpisuje istniejących plików** — raportuje, co dołożył (`+`),
a co pominął (`=`). Dzięki temu ten sam kod obsługuje repo puste i dwuletnie.

Powstają dwa pliki i jedna modyfikacja:

```
docs/DECISIONS.md                 szkielet z opisem formatu + DEC-001 jako przykład
.github/workflows/knowledge.yml   workflow wołający npx z pinem po SHA
CLAUDE.md                         + reguła pierwszeństwa, + pusta para znaczników
```

`Transcripts/` i `HYPOTHESES.md` **nie są scaffoldowane** — powstają przy pierwszym
użyciu `/transcript-extract`. Pusty katalog to sierota, a sieroty to problem, który
kit ma likwidować.

### Krok 2 — uzupełnij cztery rzeczy ręcznie

Instalator nie może ich zgadnąć. Dopóki tego nie zrobisz, część bramek jest cicho wyłączona.

| # | Co | Gdzie | Konsekwencja pominięcia |
|---|---|---|---|
| 1 | **Ścieżki decyzyjne** w `--paths` | `.github/workflows/knowledge.yml` | bramka `decision-required` nie chroni niczego |
| 2 | **Pełny SHA** repoBrain (nigdy tag) | ten sam plik | tagi gita są mutowalne — to zdalny kod w CI z `--yes` |
| 3 | **Nazwiska klienta** w `--client-names` | ten sam plik | `integrity` nigdy nie wymaga `Źródło:` dla decyzji klienta |
| 4 | **Branch protection**: „require branches to be up to date" | ustawienia repo na GitHubie | dwa PR-y dodadzą ten sam numer DEC i cicho się zmergują |

Ścieżki decyzyjne zaczynaj **wąsko** — `docs/specs/**` i pliki cenowe. Nie dodawaj
katalogu migracji na starcie: większość migracji nie ma za sobą decyzji klienckiej,
a łapanie ich zamienia etykietę `no-decision` w odruch.

Punkt 3 ma bezpiecznik: jeśli zostawisz w konfiguracji niepodmieniony placeholder
(`<nazwiska klienta…>`), CLI potraktuje go jak brak flagi i **głośno wypisze**, że reguła
jest wyłączona. Cicha śmierć reguły przy zielonym CI jest gorsza niż jej brak.

### Krok 3 — pierwsza generacja

```bash
npx --yes github:monterail/repobrain#<PELNY_SHA> index
```

Zacommituj `docs/DECISIONS.md` i `CLAUDE.md` **razem**.

---

## 5. Jak powstaje dokumentacja — trzy ścieżki

### Ścieżka A — po callu z klientem: `/transcript-extract`

Główna ścieżka. Jedna komenda, cztery kroki, człowiek akceptuje każdy zapis do źródła.

```
surowy zapis (PDF / VTT, nazwa od dostawcy)
   │
   ▼  /transcript-extract <ścieżka>
   │
[1] podsumowanie → Transcripts/YYYY-MM-DD-slug.md      ← JEDYNY automatyczny zapis
   │   (kontekst, decyzje, zadania, otwarte pytania, cytaty)
   │
[2] klasyfikacja pozycji wg TRWAŁOŚCI, nie wg typu treści:
   │
   ├─ decyzja       → draft wpisu DEC          trwała, wersjonowana
   ├─ niepewność    → HYPOTHESES.md            do rozstrzygnięcia
   ├─ zadanie       → lista do wklejenia w Jirę    NIE do repo
   └─ cytat         → zostaje w podsumowaniu    archiwum
   │
[3] drafty DEC pokazane w odpowiedzi — NIE zapisane na dysk
   │
[4] człowiek wybiera, co zastosować
   │   → dopisanie na końcu docs/DECISIONS.md
   │   → npx … index
   │   → commit obu plików
   ▼
```

**Dlaczego zadania nie trafiają do repo.** W transkrypcie decyzja i zadanie wyglądają
podobnie. Różni je cykl życia: decyzja obowiązuje, aż ktoś ją odwróci; zadanie umiera
po wykonaniu. Zadania w `docs/` zamieniają się w listy TODO, których nikt nie zamyka.

**Niepewność ma bezpiecznik.** Komenda ma zakaz zmyślania — cokolwiek niejasne oznacza
`[verify]`. To jeden z placeholderów blokujących CI, więc niepewność wyciągnięta
z transkryptu fizycznie nie przejdzie do merge'a.

### Ścieżka B — decyzja przy zmianie kodu: bramka `decision-required`

```
PR rusza docs/specs/** albo **/pricing*
   │
   ├─ PR rusza też docs/DECISIONS.md?         → zielono, przechodzi
   ├─ PR ma etykietę `no-decision`?           → zielono, przechodzi (furtka)
   └─ ani jedno, ani drugie                   → CZERWONO, merge zablokowany
                                                 │
                                                 ▼
                              człowiek dopisuje wpis DEC albo świadomie
                              oznacza PR etykietą `no-decision`
```

Bramka **nie pisze wpisu** — tylko nie pozwala przejść dalej bez decyzji człowieka.
Etykieta `no-decision` jest legalną furtką (nie każda zmiana specyfikacji to decyzja
projektowa), ale jej użycia są liczone przez `/knowledge-audit`.

### Ścieżka C — ręcznie, ze skillem `decisions-format`

Decyzja, która nie wyszła ani z transkryptu, ani z PR-a — np. ustalenie na Slacku.
Piszesz wpis wprost do `docs/DECISIONS.md`. Skill `decisions-format` ładuje się w Claude Code
automatycznie, gdy piszesz lub edytujesz wpis, i pilnuje formatu, zanim zrobi to CI.

Po każdej ścieżce ten sam finał:

```bash
npx --yes github:monterail/repobrain#<PELNY_SHA> index
git add docs/DECISIONS.md CLAUDE.md && git commit
```

---

## 6. Format wpisu DEC

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

### Reguły twarde (egzekwowane przez CI)

- Wymagane pola: `Temat`, `Kontekst`, `Decyzja`, `Konsekwencje`, `Podjął`.
- Data ściśle `YYYY-MM-DD` z zerami wiodącymi. Separator `-`, `–` lub `—`.
- `Scope:` przyjmuje wyłącznie: `w cenie`, `change request`, `do wyceny`.
- Każdy nagłówek `## ` w pliku musi być kompletnym wpisem DEC — **nie ma cichego pomijania**.
  (Dlatego nagłówki sekcji opisowych w szablonie są poziomu `### `.)
- `Odwraca:` i `Zmienia:` **wykluczają się wzajemnie** — wpis ma co najwyżej jedną relację.
- Relacja musi wskazywać na wpis **wcześniejszy** wg pary (data, numer ID).
- **Nigdy nie dopisuj pola `Status:`** — patrz §7.

### Reguły miękkie (konwencja, nie kod)

- Nowe wpisy dopisuj **na końcu pliku** — równoległe PR-y dają wtedy konflikt tekstowy
  zamiast cichego auto-merge z tym samym numerem DEC.
- Zmiana merytoryczna = nowy wpis. Edycja korygująca (literówka, data, dopisanie
  `Źródło:`) jest dozwolona w miejscu.

### Placeholdery blokujące CI

```
[data]   [uzupełnij]   [TBD]   [verify]   TODO
```

Te ciągi blokują **cały plik**. Nie używaj ich jako roboczych znaczników.
Jeśli czegoś jeszcze nie wiadomo — lepiej nie commitować wpisu wcale niż commitować niepełny.

Uwaga: od pierwszego wpisu DEC w dół placeholdery są wykrywane **także wewnątrz bloków
kodu**. Blok kodu nie może być furtką do niekompletnego wpisu. W preambule (sekcja opisująca
format, przed pierwszym wpisem) bloki kodu są ignorowane — tam to dokumentacja.

---

## 7. Status jest wyliczany, nie zapisywany

Nie ma pola `Status:`. Gdyby było, ktoś musiałby je zaktualizować przy dodaniu nowego
wpisu — i tego właśnie nikt nigdy nie robi. Zamiast tego **nowy wpis deklaruje relację
do starego**, a status wynika z grafu.

| Sytuacja | Pole | Efekt w indeksie |
|---|---|---|
| Poprzednia decyzja przestaje obowiązywać w całości | `Odwraca:` | stary wpis ląduje w sekcji „Odwrócone (historia)" |
| Poprzednia obowiązuje dalej, doprecyzowujesz fragment | `Zmienia:` | stary wpis zostaje aktywny, z adnotacją *(zmienione przez DEC-XXX)* |
| Temat niezwiązany z niczym wcześniejszym | żadne | zwykły aktywny wpis |

**Przy wątpliwości zadaj pytanie:** *czy po tej zmianie ktokolwiek nadal działa według
starego wpisu?* Jeśli tak — `Zmienia:`.

Dodatkowe reguły grafu, których pilnuje `lib/status.mjs`:

- wpis odwrócony nie może dalej „zmieniać" celu — jego doprecyzowanie umiera razem z nim,
- nie można `Zmienia:` wpisu, który został już odwrócony (błąd, blokuje CI),
- wpis z błędem walidacji (duplikat ID, obie relacje, cel z przyszłości) **nie wnosi
  krawędzi do grafu** — zostaje widoczny, ale jego relacje są ignorowane, żeby jeden
  zepsuty wpis nie zafałszował całego indeksu.

### Co widać w `CLAUDE.md`

```markdown
<!-- WYGENEROWANE:decyzje — nie edytuj. Uruchom: npx … index -->
| DEC | Data | Obszar | Temat |
|-----|------|--------|-------|
| DEC-012 | 2026-06-02 | api | Webhooki idempotentne po kluczu zdarzenia |
| DEC-007 | 2026-05-14 | billing | Faktury korygujące poza MVP *(zmienione przez DEC-011)* |

**Odwrócone (historia):**

- DEC-004 (2026-04-21) — odwrócony przez DEC-009
<!-- /WYGENEROWANE:decyzje -->
```

Najnowsze pierwsze. Generator **nigdy nie dopisuje bloku na końcu pliku** — jeśli
znaczników nie ma, odmawia i każe uruchomić `init`. Blok, który ktoś przesunął albo
zduplikował, kończy się błędem „napraw ręcznie", nie cichym nadpisaniem.

---

## 8. Bramki CI

Workflow `.github/workflows/knowledge.yml` odpala się na `pull_request`
(typy `opened, synchronize, reopened, labeled, unlabeled`) i na `push` do `main`.

> Typy `labeled`/`unlabeled` są **obowiązkowe** — bez nich dodanie etykiety `no-decision`
> nie retriggeruje builda i PR zostaje czerwony mimo poprawnej reakcji.

| Bramka | Co sprawdza | Kiedy blokuje | Jak naprawić |
|---|---|---|---|
| `integrity` | kompletność wpisów, poprawność relacji, placeholdery, istnienie plików z `Źródło:`, `Źródło:` dla decyzji klienta | zawsze | popraw wpis w `DECISIONS.md` |
| `index-fresh` | czy blok w `CLAUDE.md` = regeneracja z `DECISIONS.md` | zawsze | `npx … index` i zacommituj |
| `decision-required` | czy PR ruszający ścieżki decyzyjne dotyka `DECISIONS.md` | tylko w kontekście PR i tylko gdy podano `--paths` | dopisz wpis DEC albo etykietę `no-decision` |

Bramki pominięte są **wypisywane w logu**, np.:

```
✓ repoBrain — bramki zielone: integrity, index-fresh (pominięte: decision-required (brak --paths — żadna ścieżka nie jest chroniona))
```

To celowe: „wszystko zielone" nie może znaczyć „bramka nigdy nie pobiegła". Z tego samego
powodu CLI odrzuca nieznane flagi (literówka `--pahts` zamiast `--paths` byłaby cicho
zignorowana) i traktuje niepodmieniony placeholder w `--client-names` jak brak flagi,
komunikując to wprost.

### Uzupełnienie bramek: `/knowledge-audit`

Bramki łapią pojedyncze zdarzenia. Audyt łapie **dryf systemowy** — rzeczy, których
blokowanie dawałoby fałszywe alarmy:

1. **Zgubione decyzje** — transkrypt z sekcją „Decyzje", na który żaden DEC nie wskazuje
   przez `Źródło:`. Ostrzeżenie, nie błąd: nie każda decyzja z callu zasługuje na wpis.
2. **Użycia furtki** — liczba PR-ów z etykietą `no-decision` z ostatnich 30 dni. Rosnąca
   oznacza, że ścieżki decyzyjne są za szerokie albo bramka jest obchodzona. To jedyna
   obrona przed cichym znormalizowaniem furtki.
3. **Dokumenty bez odsyłaczy** — pliki w `docs/`, do których nic w repo nie linkuje.
4. **Martwe linki wewnętrzne** — świadomie poza CI, bo ścieżki względne dawałyby fałszywe alarmy.

Pole `Źródło:` domyka pętlę w obie strony: **w przód** `integrity` blokuje wpis wskazujący
na nieistniejący transkrypt; **wstecz** audyt ostrzega, że coś z rozmowy wypadło.

---

## 9. Komendy CLI

```bash
npx --yes github:monterail/repobrain#<PELNY_SHA> <init|index|check> [flagi]
```

| Komenda | Flagi | Działanie |
|---|---|---|
| `init` | — | tworzy `docs/DECISIONS.md`, workflow, dopisuje sekcję do `CLAUDE.md`. Nigdy nie nadpisuje. |
| `index` | — | regeneruje blok w `CLAUDE.md`. Idempotentne — bez zmian wypisuje „już aktualny". |
| `check` | `--paths`, `--client-names` | uruchamia bramki. Wypisuje wszystkie błędy naraz, nie pierwszy. |

Kody wyjścia: `0` sukces, `1` błąd walidacji lub bramki, `2` nieznana komenda.

Komendy Claude Code (plugin): `/knowledge-init`, `/transcript-extract <plik>`.
Skille ładowane automatycznie: `decisions-format`, `knowledge-audit`.

---

## 10. Rytm pracy i właściciel

`DECISIONS.md` **ma przypisanego właściciela** — domyślnie PM projektu. Audyt poprzedniego
projektu sformułował prawo „każdy magazyn wymaga właściciela i tempa aktualizacji";
spec bez tego przydziału powtarzałby błąd, który opisuje.

| Kiedy | Kto | Co |
|---|---|---|
| po każdym callu z klientem | właściciel | `/transcript-extract`, akceptacja draftów |
| przy każdym PR w ścieżkach decyzyjnych | autor PR-a | wpis DEC albo świadoma etykieta |
| po każdej edycji `DECISIONS.md` | autor | `npx … index`, commit obu plików |
| raz na sprint | właściciel | `/knowledge-audit`, przegląd użyć furtki |
| gdy furtka rośnie | właściciel | zawężenie albo rozszerzenie ścieżek decyzyjnych |

**Zielone CI nie znaczy zdrowy second brain.** Bramki pilnują świeżości derywaty przy
zmianach *kodu*. Decyzja z calla, która nie dotyka żadnej ścieżki decyzyjnej („klient
potwierdził, że pakiet premium zawiera X"), nie ma żadnej bramki — jej jedyną drogą
do repo jest człowiek. Dlatego rola jest przypisana, a nie dorozumiana.

---

## 11. Czego repoBrain nie robi

Świadome granice, żeby nie budować oczekiwań, których kit nie spełnia:

- **Nie pilnuje, czy źródło opisuje rzeczywistość.** Gwarancja dotyczy dryfu *kopii*,
  nie dryfu *wiedzy*. `Odwraca:` deklaruje ten sam człowiek, który wcześniej zapominał
  zaktualizować `Status:`. Zysk jest realny, ale mniejszy niż brzmi: nowy wpis to lepszy
  moment na przypomnienie niż powrót do starego, a jedno miejsce zapisu bije dwa.
- **Nie zapisuje niczego automatycznie do `DECISIONS.md`.** Bez auto-commitu w CI,
  bez hooka pre-commit. Automat piszący do repo bez człowieka jest przyczyną defektu,
  który naprawiamy.
- **Nie generuje listy plików w `docs/`.** Problem sierot to brak kuracji, nie brak listy;
  automatyczna lista to `ls -R` w markdownie. Zamiast tego `/knowledge-audit` raportuje
  dokumenty, do których nic nie linkuje.
- **Nie parsuje surowych PDF-ów w CI.** To zadanie dla agenta z człowiekiem w pętli.
- **Nie migruje istniejących repo.** Instalator nie nadpisuje, więc retrofit jest możliwy
  później, ale konwersja formatu starych wpisów nie jest zbudowana ani przetestowana.
- **Nie działa offline.** Workflow ściąga kod przez `npx` z GitHuba. Ryzyko rezydualne
  zapisane świadomie: przy awarii GitHuba merge'e stają, a `continue-on-error: true`
  dodane pod presją deadline'u ma tendencję do pozostawania na zawsze.

---

## 12. Rozwój kitu

```
bin/knowledge.mjs     CLI — jedyne miejsce znające filesystem, argv i zmienne CI
lib/parse.mjs         Markdown → obiekty DEC
lib/status.mjs        derywacja statusu z grafu relacji
lib/render.mjs        render bloku + wstrzyknięcie między znaczniki
lib/integrity.mjs     placeholdery, istnienie źródeł, decyzje klienta
lib/gates.mjs         trzy bramki CI
lib/fences.mjs        maska bloków kodu
lib/init.mjs          plan instalacji (czysta funkcja)
templates/            szablony kopiowane przez `init`
.claude-plugin/       komendy i skille pluginu Claude Code
```

**Niezmiennik architektoniczny:** `lib/` nie może zależeć ani od API Claude Code,
ani od API GitHub Actions. Naruszenie wyłączyłoby kit w CI — czyli w jedynym miejscu,
gdzie egzekwowanie realnie następuje. Dlatego wszystko w `lib/` to czyste funkcje:
tekst na wejściu, obiekty i tablica błędów na wyjściu.

```bash
npm test        # node:test, zero zależności, bez mocków i plików tymczasowych
```

Projekt: [`docs/design/2026-07-28-repobrain-design.md`](docs/design/2026-07-28-repobrain-design.md) ·
plan implementacji: [`docs/plans/2026-07-28-repobrain-implementation.md`](docs/plans/2026-07-28-repobrain-implementation.md)
