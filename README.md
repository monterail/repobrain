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
6. [Routing dokumentów zespołowych](#6-routing-dokumentów-zespołowych)
7. [Format wpisu DEC](#7-format-wpisu-dec)
8. [Status jest wyliczany, nie zapisywany](#8-status-jest-wyliczany-nie-zapisywany)
9. [Bramki CI](#9-bramki-ci)
10. [Komendy CLI](#10-komendy-cli)
11. [Rytm pracy i właściciel](#11-rytm-pracy-i-właściciel)
12. [Czego repoBrain nie robi](#12-czego-repobrain-nie-robi)
13. [Rozwój kitu](#13-rozwój-kitu)

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

Sześć kroków, ~15 minut. Kroki 1–5 są obowiązkowe, krok 6 (plugin Claude Code) opcjonalny.

### Wymagania wstępne

| Czego potrzebujesz | Po co | Jak sprawdzić |
|---|---|---|
| Node.js ≥ 20 | CLI używa `node:test` i natywnych ESM | `node --version` |
| repo na GitHubie z włączonymi Actions | bramki biegną jako workflow | Settings → Actions |
| uprawnienia **admina** do repo | branch protection (krok 4) | Settings → Branches jest widoczne |
| `gh` CLI (opcjonalnie) | szybsze ustawienie branch protection | `gh auth status` |

Kit nie ma zależności runtime'owych — `npx` ściąga sam kod repoBrain i nic poza tym.

### Krok 1 — ustal pełny SHA

Workflow **pinuje commit po pełnym SHA, nigdy po tagu**. Tagi gita są mutowalne: każdy
z prawem pushu do repo kitu mógłby przesunąć `v1.0.0` i wykonać dowolny kod — z flagą
`--yes` — w CI wszystkich projektów agencji.

```bash
git ls-remote https://github.com/monterail/repobrain.git main
# 85d7898f…  refs/heads/main   ← ten SHA wklejasz w krokach 2 i 3
```

Zapisz go sobie — pojawi się w trzech miejscach. Dalej oznaczam go jako `<SHA>`.

### Krok 2 — uruchom instalator

```bash
cd /ścieżka/do/projektu
npx --yes github:monterail/repobrain#<SHA> init
```

Z pluginem Claude Code równoważnie: `/knowledge-init`.

Instalator **nigdy nie nadpisuje istniejących plików** — raportuje, co dołożył (`+`),
a co pominął (`=`). Dzięki tej regule ten sam kod obsługuje repo puste i dwuletnie,
bez osobnego trybu „retrofit".

```
  + docs/DECISIONS.md
  + .github/workflows/knowledge.yml
  ~ CLAUDE.md (dopisano sekcję Źródła prawdy)
```

| Plik | Zawartość | Jeśli już istnieje |
|---|---|---|
| `docs/DECISIONS.md` | opis formatu + `DEC-001` jako działający przykład | pomijany w całości |
| `.github/workflows/knowledge.yml` | workflow wołający `npx` z pinem po SHA | pomijany w całości |
| `CLAUDE.md` | reguła pierwszeństwa + pusta para znaczników | **dopisywany na końcu**, nie nadpisywany |

Jeśli `CLAUDE.md` już zawiera znaczniki `WYGENEROWANE:decyzje`, instalator też ich nie
rusza — wypisze `= CLAUDE.md (znaczniki już są, pominięto)`.

`Transcripts/` i `HYPOTHESES.md` **nie są scaffoldowane** — powstają przy pierwszym
użyciu `/transcript-extract`. Pusty katalog to sierota, a sieroty to problem, który
kit ma likwidować.

> **Instalacja przerwana w połowie?** Instalator wypisze, które pliki zdążyły powstać,
> i każe posprzątać ręcznie. Nie ma automatycznego rollbacku: kasowanie plików w cudzym
> repo jest gorszym domyślnym zachowaniem niż komunikat.

### Krok 3 — uzupełnij trzy rzeczy w workflow

Instalator nie może ich zgadnąć. **Dopóki tego nie zrobisz, część bramek jest wyłączona.**

Otwórz `.github/workflows/knowledge.yml` i podmień ostatnią linię:

```yaml
# PRZED (prosto z instalatora)
- run: npx --yes github:monterail/repobrain#<PELNY_SHA> check
       --paths 'docs/specs/**,**/pricing*'
       --client-names '<nazwiska klienta po przecinku, np. Kowalski, Nowak>'

# PO (uzupełnione)
- run: npx --yes github:monterail/repobrain#85d7898f… check
       --paths 'docs/specs/**,docs/api-contract.md,**/pricing*'
       --client-names 'Nowak, Wiśniewska'
```

| # | Co | Konsekwencja pominięcia |
|---|---|---|
| 1 | **`<PELNY_SHA>`** → SHA z kroku 1 | workflow wywali się na nieistniejącej referencji |
| 2 | **`--paths`** → ścieżki decyzyjne tego projektu | bramka `decision-required` nie chroni niczego |
| 3 | **`--client-names`** → nazwiska osób decyzyjnych po stronie klienta | `integrity` nigdy nie wymaga `Źródło:` dla decyzji klienta |

**Jak dobrać `--paths`.** Zacznij **wąsko**: `docs/specs/**` i pliki cenowe. Nie dodawaj
katalogu migracji na starcie — większość migracji nie ma za sobą decyzji klienckiej,
a łapanie ich zamienia etykietę `no-decision` w odruch. Ścieżki rozszerza się później,
gdy audyt pokaże, że coś ważnego przechodzi bez wpisu. Składnia globów: `*` nie
przekracza `/`, `**` przekracza.

**Jak dobrać `--client-names`.** Dopasowanie jest **po podciągu, bez wielkości liter**,
i celowo luźne — `Nowak` trafi też w `Nowakowski`. Kierunek błędu jest bezpieczny:
fałszywy alarm („wymagamy `Źródło:` tam, gdzie nie trzeba") jest tańszy niż przeoczona
decyzja klienta bez dowodu.

**Bezpiecznik.** Jeśli zostawisz niepodmieniony placeholder (`<nazwiska klienta…>`),
CLI potraktuje go jak brak flagi i **głośno to wypisze**:

```
ℹ reguła „decyzja klienta wymaga pola Źródło" jest wyłączona — --client-names zawiera
  niepodmieniony placeholder z konfiguracji, traktowany jak brak flagi.
```

Cicha śmierć reguły przy zielonym CI jest gorsza niż jej brak. Z tego samego powodu CLI
odrzuca nieznane flagi — literówka `--pahts` zatrzymuje build, zamiast zostać zignorowana.

### Krok 4 — włącz branch protection

**To jest warunek instalacji, nie zalecenie.** Bez „require branches to be up to date"
dwa PR-y mogą dodać wpis o tym samym numerze DEC i auto-zmergować się (wstawiają tekst
w różnych miejscach pliku, więc git nie widzi konfliktu). Drugi merge czerwieni `main`,
a naprawa przez przenumerowanie unieważnia referencje zdążone już w Slacku i w polach
`Odwraca:`.

Przez UI: **Settings → Branches → Add branch protection rule** dla `main`:

- ✅ Require status checks to pass before merging
- ✅ **Require branches to be up to date before merging** ← to jest ten krytyczny
- w liście checków wybierz `knowledge`

Przez `gh` CLI:

```bash
gh api -X PUT repos/OWNER/REPO/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["knowledge"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```

`"strict": true` to dokładnie „require branches to be up to date".

### Krok 5 — pierwsza generacja i commit

```bash
npx --yes github:monterail/repobrain#<SHA> index
```

```
✓ CLAUDE.md zaktualizowany — 1 aktywnych, 0 w historii
```

Zacommituj **oba pliki razem** — rozdzielenie ich na dwa commity da czerwoną bramkę
`index-fresh` na tym pierwszym:

```bash
git add docs/DECISIONS.md CLAUDE.md .github/workflows/knowledge.yml
git commit -m "chore: instalacja repoBrain"
```

### Weryfikacja — czy na pewno działa

Uruchom bramki lokalnie, dokładnie tak, jak zrobi to CI:

```bash
npx --yes github:monterail/repobrain#<SHA> check \
  --paths 'docs/specs/**' --client-names 'Nowak'
```

```
✓ repoBrain — bramki zielone: integrity, index-fresh
  (pominięte: decision-required (brak kontekstu PR))
```

Lokalnie `decision-required` zawsze jest pomijana — potrzebuje `GITHUB_EVENT_PATH`
i kontekstu pull requesta. **To jest oczekiwane.** Żeby sprawdzić ją naprawdę, zrób
próbny PR dotykający ścieżki decyzyjnej i zobacz, czy zapali się na czerwono.

Checklista po instalacji:

- [ ] `npx … check` lokalnie zielone
- [ ] workflow przeszedł na pierwszym PR (zakładka Actions)
- [ ] w logu CI **nie ma** komunikatu o wyłączonej regule `--client-names`
- [ ] w logu CI bramka `decision-required` jest w „zielonych", nie w „pominiętych"
- [ ] próbny PR w `docs/specs/**` bez wpisu DEC → czerwony
- [ ] ten sam PR z etykietą `no-decision` → zielony (i build się retriggerował)
- [ ] `main` ma branch protection ze `strict: true`
- [ ] `DECISIONS.md` ma przypisanego właściciela (patrz §11)

### Krok 6 — plugin Claude Code (opcjonalnie)

Plugin daje zespołowi komendy `/knowledge-init`, `/transcript-extract` i skille
`decisions-format`, `knowledge-audit`. **Nie jest wymagany** — bramki CI działają
niezależnie od Claude Code, taki był niezmiennik architektoniczny.

Najprostsza droga dzisiaj: skopiuj zawartość `.claude-plugin/` do katalogu `.claude/`
projektu docelowego i zacommituj — skille i komendy działają wtedy dla całego zespołu:

```bash
git clone https://github.com/monterail/repobrain.git /tmp/repobrain
mkdir -p .claude/skills .claude/commands
cp -r /tmp/repobrain/.claude-plugin/skills/* .claude/skills/
cp -r /tmp/repobrain/.claude-plugin/commands/* .claude/commands/
```

W skopiowanych plikach podmień `<PELNY_SHA>` na SHA z kroku 1 — komendy wołają CLI
z tym samym pinem co workflow.

> Repo nie ma jeszcze `.claude-plugin/marketplace.json`, więc instalacja przez
> `/plugin marketplace add` nie zadziała. To znany brak, nie błąd konfiguracji po Twojej stronie.

### Aktualizacja kitu

Poprawka w repoBrain nie propaguje się sama — pin po SHA jest tego świadomym kosztem.
Żeby podnieść wersję w projekcie: weź nowy SHA (krok 1), podmień go w
`.github/workflows/knowledge.yml` oraz w skopiowanych komendach, zrób PR. Zielony build
na tym PR jest potwierdzeniem, że nowa wersja nie psuje istniejących wpisów.

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

## 6. Routing dokumentów zespołowych

Zespół produkuje więcej niż transkrypty z callów: BA papers, notatki z refinementów,
dokumentację architektury, research. Ta sekcja mówi, gdzie każda z tych rzeczy ma żyć.

### Jedno pytanie rozstrzyga wszystko

> **Czy ta rzecz obowiązuje, dopóki ktoś jej nie odwróci?**

```
                    ┌─ TAK ──────────────▶ wpis DEC w docs/DECISIONS.md
                    │
czy obowiązuje      ├─ NIE, ale jest dowodem, skąd wzięła się decyzja
aż do odwrócenia?   │                    ▶ Transcripts/YYYY-MM-DD-slug.md
                    │
                    ├─ NIE, to kontrakt: co dokładnie budujemy
                    │                    ▶ docs/specs/
                    │
                    ├─ NIE, to niepewność do rozstrzygnięcia
                    │                    ▶ HYPOTHESES.md
                    │
                    └─ NIE, po prostu się przyda
                                         ▶ zwykłe docs/, bez ceremonii
```

**Kryterium to cykl życia, nie typ dokumentu.** Decyzja i zadanie wyglądają w notatce
podobnie; różni je to, że decyzja obowiązuje aż ktoś ją odwróci, a zadanie umiera
po wykonaniu.

### Tabela routingu

| Dokument | Gdzie | Dlaczego |
|---|---|---|
| BA paper definiujący **co budujemy** | `docs/specs/` + wpis DEC na rozstrzygnięcia sporne | kontrakt implementacyjny — poziom 3 reguły pierwszeństwa |
| BA paper **analityczny** (opcje, porównania, research) | zwykłe `docs/`; wynik → wpis DEC | zestarzeje się w chwili, gdy decyzja zapadnie |
| Notatki z refinementu | `Transcripts/YYYY-MM-DD-refinement-slug.md`, `Typ: wewnętrzne` | ten sam cykl życia co transkrypt: dowód, upstream decyzji |
| Warsztat discovery | `Transcripts/…`, `Typ: discovery` | jw. |
| Ustalenia z dostawcą | `Transcripts/…`, `Typ: vendor` | jw. |
| Otwarte pytania z refinementu | `HYPOTHESES.md` | mają zostać rozstrzygnięte, nie zarchiwizowane |
| Ustalenia „to jest w cenie / to change request" | wpis DEC ze `Scope:` | dokładnie to, przed czym `Scope:` chroni w sporze |
| Decyzja architektoniczna (ADR-owa) | wpis DEC — **nie osobny ADR** | dublowanie magazynów to defekt, który kit likwiduje |
| Estymaty, harmonogram | poza repo (Jira) — konsekwencje → pole `Konsekwencje:` we wpisie DEC | przeterminowują się szybciej niż PR |
| Action items z dowolnego spotkania | Jira — **nie repo** | listy TODO w `docs/` to listy, których nikt nie zamyka |
| Runbook, onboarding, README modułu | zwykłe `docs/` | nikt nie musi pilnować ich świeżości |

### Trzy rzeczy, które działają, choć nazwy sugerują inaczej

**1. `Transcripts/` nie jest tylko dla klienta.** Szablon podsumowania ma pole `Typ:`
z czterema wartościami — `klient / wewnętrzne / discovery / vendor`. Refinement to
`wewnętrzne`, warsztat BA to `discovery`. Katalog trzyma podsumowania **dowolnego
spotkania**, nie tylko rozmów z klientem.

**2. `/transcript-extract` przyjmuje każdy plik.** Notatki z refinementu, zrzut z Miro,
podsumowanie z Confluence — komenda robi z nich podsumowanie w ustandaryzowanym formacie
i proponuje drafty DEC. Nie musi to być stenogram.

**3. `Źródło:` może wskazywać na cokolwiek w repo.** Bramka `integrity` sprawdza
wyłącznie, czy plik istnieje — nie wymusza prefiksu `Transcripts/`. BA paper jest
legalnym materiałem dowodowym:

```markdown
**Źródło:** docs/specs/ba-model-rozliczen.md
```

### Dokument nie jest jednostką wiedzy — decyzja jest

BA paper na dwadzieścia stron może nieść trzy decyzje i siedemnaście opisów. Proces
**nie archiwizuje papera jako „wiedzy"** — wyciąga z niego trzy wpisy DEC i zostawia
paper jako dowód, na który te wpisy wskazują przez `Źródło:`.

Dlatego nie ma i nie powinno być „bramki na kompletność dokumentacji projektowej":
mierzyłaby objętość, nie wiedzę. Jedyne, co repoBrain sprawdza w dokumentacji poza
`DECISIONS.md`, to czy zmiana w ścieżce decyzyjnej ma za sobą decyzję.

### Dwie znane luki

Zapisane świadomie, żeby nie budować fałszywego poczucia pokrycia:

**Dryf specyfikacji względem decyzji.** DEC-039 zmienia zachowanie billingu,
`docs/specs/billing.md` dalej opisuje stare — i **nic tego nie łapie**. Bramki pilnują
świeżości bloku w `CLAUDE.md`, nie świeżości speców. Spec pozostaje ręczną kopią wiedzy,
czyli dokładnie tą kategorią, którą kit likwiduje w jednym miejscu i toleruje w drugim.
Obejście proceduralne: przy wpisie DEC wypełniaj `Konsekwencje:` na tyle konkretnie,
żeby review PR-a zobaczył, który spec wymaga aktualizacji.

**Sprzężenie wsteczne działa tylko dla `Transcripts/`.** `/knowledge-audit` sprawdza,
czy podsumowanie z sekcją „Decyzje" ma na siebie wskazujący wpis DEC. BA paper
z decyzjami, z którego nikt nie zrobił wpisów, **nie zostanie zgłoszony** — audyt nie
zagląda poza `Transcripts/`.

---

## 7. Format wpisu DEC

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
- **Nigdy nie dopisuj pola `Status:`** — patrz §8.

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

## 8. Status jest wyliczany, nie zapisywany

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

## 9. Bramki CI

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

## 10. Komendy CLI

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

## 11. Rytm pracy i właściciel

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

## 12. Czego repoBrain nie robi

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

## 13. Rozwój kitu

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
