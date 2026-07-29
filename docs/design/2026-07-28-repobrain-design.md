# repoBrain — projekt systemu wiedzy w repo

**Data:** 2026-07-28
**Status:** zatwierdzony do planowania (po recenzji Fable 5, 2026-07-28)
**Autor:** Dominik Pawluś (design z Claude)
**Poprzednik:** audyt poprzedniego projektu `docs/reviews/second-brain-audit-2026-07-27.md` — pozostaje w prywatnym repo tamtego projektu

---

## 1. Problem

Audyt poprzedniego projektu z 2026-07-27 wykazał siedem defektów w warstwie wiedzy. Wszystkie mają jedną przyczynę mechaniczną:

> **Wiedza była utrzymywana jako ręczne kopie. Kopia bez właściciela rozjeżdża się z oryginałem — to kwestia czasu, nie staranności.**

Dowody z tamtego projektu:

| Objaw | Dane |
|---|---|
| `.claude/memory/` zamrożone po jednym commicie | 96 plików, 2026-07-08, **0 wspólnych nazw** z magazynem prywatnym |
| Dwa pliki twierdzą odwróconą decyzję | `project_billing_decisions.md`, `project_billing_ux_view.md` vs DEC-033 |
| **Sam `DECISIONS.md` jest niespójny** | DEC-015 ma `Status: decided`, choć DEC-033 go odwrócił |
| Hook commitował cudzą pracę | 10 commitów „chore: sync PM memory", **9 bez plików pamięci**; `d2e431f` na `main` |
| Kopie bazy wiedzy w worktree | 3,4 GB, 8 144 plików `.md`, 80 % szumu w grepach |
| Dokumenty-sieroty | 58 ze 135 |

Trzeci wiersz jest najważniejszy: skłamał **najlepszy** artefakt systemu. To wyklucza rozwiązania oparte na dyscyplinie.

### Zakres tezy — po korekcie

Teza „derywata + check w CI nie może się rozjechać" jest prawdziwa dla **dryfu kopii**, nie dla **dryfu wiedzy**. Kit gwarantuje, że wygenerowany widok nie rozjedzie się ze źródłem. Nie gwarantuje, że źródło opisuje rzeczywistość — bo `Odwraca:` deklaruje ten sam człowiek, który wcześniej zapominał zaktualizować `Status:`. Zysk jest realny, ale mniejszy niż brzmiał: **nowy wpis to lepszy moment na przypomnienie niż powrót do starego**, a jedno miejsce zapisu bije dwa. Nie więcej.

## 2. Ograniczenia

| Wymiar | Ustalenie |
|---|---|
| Kolejny projekt | Ten sam kształt co tamten projekt: klient, 2-3 devów + PM, Jira/Slack, decyzje klienckie, fixed-price |
| Odbiorca | **Cały zespół** — system musi być samoopisujący i przeżyć ludzi, którzy go ignorują |
| Egzekwowanie | **Blokujące CI** z furtką (etykieta `no-decision`) — od pierwszego PR-a |
| Zakres | **Wyłącznie nowe projekty.** Retrofit tamtego projektu odroczony |
| Widoczność kitu | Repo **publiczne** — zero danych klienta |
| Warunek instalacji | Branch protection „require branches to be up to date" — patrz §4.4 |

## 3. Model wiedzy

### Trzy poziomy

**Poziom 1 — źródło prawdy.** Ręczne, przechodzi review w PR.

| Ścieżka | Rola |
|---|---|
| `docs/DECISIONS.md` | kręgosłup: decyzje klienckie i techniczne |
| `docs/specs/`, `docs/api-contract.md` | kontrakt implementacyjny |
| `Transcripts/` | **materiał dowodowy** — upstream decyzji, nie materiał do recall |

**Poziom 2 — derywata.** Generowana, **nigdy pisana ręcznie**.

| Gdzie | Zawiera |
|---|---|
| blok w `CLAUDE.md` między znacznikami `WYGENEROWANE:decyzje` | wyłącznie **aktywne** decyzje, jedna linia każda |

**Poziom 3 — poza repo.** Pamięć prywatna w `~/.claude/projects/`. Zero synchronizacji do repo. Próba takiej synchronizacji była źródłem dwóch z siedmiu defektów w tamtym projekcie.

### Dlaczego derywata mieszka w `CLAUDE.md`, a nie w osobnym pliku

Pierwotny projekt emitował `.claude/knowledge-index.md`. Recenzja wykazała, że **ten plik nie miałby konsumenta**: Claude Code go nie ładuje automatycznie, nic na niego nie wskazuje, reguła pierwszeństwa go nie wymienia. Powstałaby wygenerowana sierota — kategoria, którą kit rzekomo likwiduje.

Równolegle sekcja „Fakty" w `CLAUDE.md` była w projekcie **ręczną kopią treści decyzji**, zasilaną przez `/transcript-extract`. To jest dokładnie mechanizm, przez który `CLAUDE.md` w tamtym projekcie urósł do encyklopedii z przekreśleniami i wtrąceniami „update 2026-06-17". Reguła „przy rozbieżności wygrywa DECISIONS.md" była przyznaniem, że kopia się rozjedzie — czyli zarządzaniem dryfem zamiast jego eliminacją, w pliku ładowanym do kontekstu **zawsze**.

Jedno rozwiązanie zamyka oba problemy: aktywne decyzje są renderowane wprost do `CLAUDE.md` między znacznikami. Konsument gwarantowany, kopia o najwyższej stawce przestaje być kopią, jeden plik mniej.

```markdown
<!-- WYGENEROWANE:decyzje — nie edytuj. Uruchom: npx … index -->
| DEC | Data | Obszar | Temat |
|-----|------|--------|-------|
| DEC-039 | 2026-07-20 | billing | Faktura korygująca poza limitem *(zmienia DEC-036)* |
<!-- /WYGENEROWANE:decyzje -->
```

Sekcja „Fakty" pisana ręcznie **znika z modelu**. Fakt, którego nikt nie podjął jako decyzji, nie jest wiedzą projektową — jest notatką.

### Reguła pierwszeństwa

Trafia do `CLAUDE.md` każdego projektu:

```
1. docs/DECISIONS.md — pełna treść decyzji; Odwraca:/Zmienia: rozstrzygają aktualność
2. blok WYGENEROWANE:decyzje w tym pliku — skrót aktywnych, zawsze zgodny z (1)
3. docs/specs/ + api-contract.md — kontrakt implementacyjny
4. Transcripts/ — materiał dowodowy, gdy 1-3 milczą
Wszystko poza tą listą to notatki robocze, nie źródło prawdy.
```

### Format wpisu DEC

```markdown
## DEC-039 — 2026-07-20
**Zmienia:** DEC-036
**Obszar:** billing, webhooki
**Scope:** w cenie
**Źródło:** Transcripts/2026-07-20-call-klient.md
**Temat:** Faktura korygująca nie wlicza się do limitu i nie wysyła powiadomienia
**Kontekst:** …
**Decyzja:** …
**Konsekwencje:** …
**Podjął:** Kowalska — call 2026-07-20
```

**Ręczne pole `Status:` zostaje usunięte.** Status jest wyliczany z grafu relacji.

#### Trzy relacje między wpisami

| Pole | Semantyka | Efekt w indeksie |
|---|---|---|
| `Odwraca: DEC-X` | X przestaje obowiązywać w całości | X znika z aktywnych, ląduje w historii |
| `Zmienia: DEC-X` | X obowiązuje dalej, ten wpis doprecyzowuje fragment | oba aktywne; przy X adnotacja „zmienione przez" |
| brak | decyzja niezależna | aktywna |

Rozróżnienie wymuszone danymi: w tamtym projekcie są **3 pełne odwrócenia** (DEC-006←009, DEC-015←033, DEC-035←036) i **1 doprecyzowanie** — DEC-039 rozstrzyga otwarte pytania DEC-036, przy czym rdzeń DEC-036 (auto-korekta) obowiązuje dalej. Model binarny zmuszałby autora DEC-039 do wyboru między dwoma błędami: `Odwraca:` skasowałby obowiązującą decyzję, brak pola zostawiłby w indeksie nieaktualny szczegół.

Oba pola muszą wskazywać na wpis **wcześniejszy** — wcześniejszy według daty, a przy równej dacie według numeru ID. Wskazanie w przód jest błędem formatu, nie decyzją.

#### Pozostałe pola

Wymagane: `Temat`, `Kontekst`, `Decyzja`, `Konsekwencje`, `Podjął`. Opcjonalne: `Odwraca`, `Zmienia`, `Obszar`, `Scope`, `Źródło`.

**`Scope:`** przyjmuje `w cenie | change request | do wyceny`. Przy fixed-price najbardziej spornym typem wiedzy nie jest „jak działa X", tylko „czy X jest w cenie" — a model, który tego nie zapisuje, nie chroni w sporze, dla którego powstał. tamten projekt trzymała to w `COMMERCIAL.md`, poza jakimkolwiek mechanizmem.

**`Źródło:`** to ścieżka do materiału dowodowego. **Wymagane, gdy `Podjął:` wskazuje klienta** — bo tam właśnie dowód jest potrzebny. Przy decyzji zespołowej opcjonalne.

**`Obszar:`** dowolny tekst, lista po przecinku. Zero maszynerii walidującej tagi — wrócić do tematu po ~30 wpisach, wcześniej to YAGNI.

#### Polityka edycji istniejących wpisów

„Nigdy nie wraca się do starego wpisu" było zbyt mocne — tamten projekt łamie to dwa razy (`DEC-016 (confirmed 2026-05-04)`, `DEC-021 (zaktualizowane 2026-05-27)`). Obowiązuje więc rozróżnienie:

- **Edycja korygująca** (literówka, zła data, dopisanie `Źródło:`) — dozwolona w miejscu.
- **Zmiana merytoryczna** — wyłącznie nowym wpisem z `Odwraca:` albo `Zmienia:`.

Granica jest nieegzekwowalna maszynowo i to jest świadome. Egzekwuje ją review PR-a.

### Transkrypty spotkań

Transkrypty są źródłem, z którego powstają wpisy DEC — nie treścią indeksu. Pipeline pozostaje ręcznie wyzwalany:

```
surowy zapis (PDF/VTT, nazwa od dostawcy)
   ↓  /transcript-extract  — jedna komenda, człowiek akceptuje każdy zapis
   ├─ Transcripts/YYYY-MM-DD-slug.md   podsumowanie (archiwum + dowód)
   ├─ draft wpisów DEC z polami Źródło: i Scope: → docs/DECISIONS.md
   ├─ draft niepewności → HYPOTHESES.md
   └─ lista action itemów → do wklejenia w Jirę (NIE do repo)
```

Kit standaryzuje **wyłącznie nazwę pliku podsumowania** (`YYYY-MM-DD-slug.md`), żeby odwołania z `Źródło:` były przewidywalne. Surowych zapisów nie rusza.

#### Klasyfikacja według trwałości

Ekstrakcja sama w sobie jest rozwiązanym problemem — szablon z tamtego projektu (kontekst, decyzje, action items, implikacje scope'u, otwarte pytania, cytaty) sprawdził się w praktyce; z podsumowania z 2026-04-29 powstały DEC-011…DEC-015. Brakowało **rozwiezienia pozycji tam, gdzie mają żyć**:

| Typ pozycji | Cel | Trwałość |
|---|---|---|
| Decyzja | draft wpisu DEC | trwała, wersjonowana |
| Niepewność, założenie | `HYPOTHESES.md` | do rozstrzygnięcia |
| Action item | lista do wklejenia w Jirę | przejściowa — **nie trafia do repo** |
| Cytat | zostaje w podsumowaniu jako dowód | archiwum |

Kryterium routingu to **cykl życia, nie typ treści**. Decyzja i zadanie wyglądają w transkrypcie podobnie; różni je to, że decyzja obowiązuje aż ktoś ją odwróci, a zadanie umiera po wykonaniu. Zadania w `docs/` zamieniłyby się w listy TODO, których nikt nie zamyka.

Komenda **nie zapisuje niczego bez akceptacji człowieka** — ta sama zasada, dla której odrzucamy auto-commit w CI (§4.5).

#### Sprzężenie zwrotne pola `Źródło:`

| Kierunek | Pytanie | Gdzie |
|---|---|---|
| w przód | czy transkrypt wskazany w DEC istnieje? | bramka `integrity`, **blokuje** |
| wstecz | czy transkrypt z decyzjami ma choć jeden DEC na siebie wskazujący? | `/knowledge-audit`, **ostrzega** |

Sprzężenie wsteczne odpowiada na pytanie „czy coś z tej rozmowy wypadło". Świadomie nie jest bramką CI: nie każda decyzja z callu zasługuje na wpis DEC, więc blokowanie generowałoby fałszywe alarmy.

## 4. Mechanizm

### 4.1 Generator

Wejście: `docs/DECISIONS.md`.
Kroki: parsowanie bloków → budowa grafu z `Odwraca:`/`Zmienia:` → wyliczenie aktywnych → renderowanie bloku w `CLAUDE.md` między znacznikami.

Generator podmienia **wyłącznie zawartość między znacznikami**. Brak znaczników w `CLAUDE.md` = błąd z instrukcją uruchomienia `init`, nigdy ciche dopisanie na końcu.

### 4.2 Twarda reguła parsowania

**Każdy nagłówek `## ` w `DECISIONS.md`, który nie jest w pełni poprawnym blokiem DEC, to twardy błąd bramki `integrity`.**

Bez tej reguły literówka w nagłówku (`## DEC-41 - 2026-9-3`) powodowałaby ciche pominięcie: decyzja znika z indeksu, obie bramki świecą na zielono. To stan **gorszy** niż kłamiące `Status: decided` z tamten projekt — tam wpis przynajmniej istniał.

Separator daty akceptuje `-`, `–` i `—`. Wymaganie em-dasha byłoby proszeniem się o kłopoty.

### 4.3 Trzy bramki CI

| Bramka | Wykrywa |
|---|---|
| `index-fresh` | regeneracja bloku daje inny wynik niż commit |
| `integrity` | błąd formatu lub sprzeczność w grafie |
| `decision-required` | PR w ścieżkach decyzyjnych bez wpisu DEC |

`integrity` sprawdza: każdy `## ` jest poprawnym blokiem DEC · `Odwraca:`/`Zmienia:` wskazują na istniejący, wcześniejszy DEC · brak duplikatów ID · `Źródło:` wskazuje na istniejący plik · `Źródło:` obecne, gdy `Podjął:` wskazuje klienta · brak niewypełnionych placeholderów.

Placeholdery wykrywane przez **zamkniętą listę** (`[data]`, `[uzupełnij]`, `[TBD]`, `[verify]`, `TODO`), nie przez wzorzec „dowolny `[...]`". Dane z tamten projekt: obok trzech `[data]` i dwóch `[uzupełnij]` występują legalne nawiasy w treści (`[usuwanie konta]`, `[modal z ostrzeżeniem]`, `[id]`). Wzorzec ogólny dałby 60 % fałszywych alarmów.

**Usunięte z bramek po recenzji:** link-checker po całym `docs/` (audyt poprzedniego projektu sam ustalił, że część martwych linków to ścieżki względne rozwiązywane z innych katalogów — bramka z fałszywymi alarmami umrze) oraz detekcja cykli (przy egzekwowanym „tylko wstecz" i zakazie duplikatów cykl jest niemożliwy; zostaje jako `assert` w kodzie, nie jako feature). Oba trafiają do `/knowledge-audit`.

### 4.4 `decision-required` — konfiguracja i tarcie

Ścieżki decyzyjne jako argument CLI, nie plik konfiguracyjny:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, labeled, unlabeled]
  push:
    branches: [main]

jobs:
  knowledge:
    steps:
      - run: npx --yes github:monterail/repobrain#<SHA> check
             --paths 'docs/specs/**,**/pricing*'
```

Trzy rzeczy wynikające wprost z recenzji:

**`types: [… labeled, unlabeled]` jest obowiązkowe.** Bez tego dodanie etykiety `no-decision` nie retriggeruje workflow i zespół odkryje w pierwszym tygodniu, że „dodałem etykietę i dalej czerwone".

**Startowe ścieżki są wąskie** — `docs/specs/` i pricing, bez `migrations/`. Większość migracji (indeks, rename kolumny) nie ma za sobą decyzji klienckiej; złapanie ich zamieniłoby etykietę w odruch, jak `--no-verify`. Rozszerzać po miesiącu obserwacji.

**Użycia `no-decision` są widoczne.** Rezygnacja z wymogu uzasadnienia jest słuszna (wymóg zachęca do obchodzenia), więc jedyną obroną zostaje widoczność: `/knowledge-audit` raportuje liczbę użyć i listę PR-ów. Bez tego furtka cicho stanie się normą.

Bramka czyta etykiety z `GITHUB_EVENT_PATH`; poza kontekstem PR (push do `main`) jest pomijana.

**Kolizja numerów DEC.** Dwa PR-y dodające DEC-040 mogą się auto-zmergować, jeśli wstawiają wpisy w różnych miejscach pliku — drugi merge czerwieni `main`, a naprawa przez przenumerowanie unieważnia referencje zdążone w Slacku i w polach `Odwraca:`. Dlatego branch protection **„require branches to be up to date before merging"** jest warunkiem instalacji (§2), nie zaleceniem. Wpisy dopisuje się na końcu pliku, żeby git dawał konflikt tekstowy zamiast cichego auto-merge.

### 4.5 Świadomie odrzucone: auto-commit regeneracji

CI **nie** commituje odświeżonego bloku. Oszczędziłoby to jeden round-trip, ale jest co do mechanizmu tym samym pomysłem, który zatruł historię tamten projekt. Build pada z komunikatem `uruchom: npx … index`.

## 5. Architektura kitu

```
repobrain/                    (publiczne repo GitHub)
  .claude-plugin/
    skills/decisions-format/         uczy agenta formatu DEC
    skills/knowledge-audit/          audyt dryfu na żądanie
    commands/knowledge-init.md       scaffolduje pliki w repo docelowym
    commands/transcript-extract.md   transkrypt → podsumowanie + rozwiezione drafty
  bin/knowledge.mjs                  CLI: `init` | `index` | `check`
  lib/parse.mjs                      parser DECISIONS.md
  lib/status.mjs                     derywacja statusu z grafu relacji
  lib/render.mjs                     render bloku do CLAUDE.md
  lib/*.test.mjs                     node:test, zero zależności
  package.json                       pole `bin`, zero dependencies
  README.md                          model na jednej stronie
```

Repo docelowe dostaje **dwa pliki i jedną modyfikację**:

```
docs/DECISIONS.md                ręczne
.github/workflows/knowledge.yml  woła npx z pinem po SHA
CLAUDE.md                        + reguła pierwszeństwa, + blok WYGENEROWANE:decyzje
```

### Pinowanie po SHA, nie po tagu

**Tagi gita są mutowalne.** Każdy z prawem pushu do repo kitu może przesunąć `v1.0.0` i wykonać dowolny kod — z flagą `--yes` — w CI wszystkich projektów klienckich agencji. Workflow pinuje więc pełny SHA commita.

### KOREKTA 2026-07-29 — `npx` zastąpione przez `actions/checkout`

> Wszystko poniżej w tej sekcji opisuje **pierwotny** mechanizm dystrybucji. Został
> wycofany po zgłoszeniu z realnego wdrożenia: `npx --yes github:…#<SHA>` **zawsze**
> pada w GitHub Actions błędem `GitFetcher requires an Arborist constructor` — to defekt
> npm 10.x, czyli wersji, którą `actions/setup-node` instaluje razem z node 20 i 22.
>
> Weryfikacja z końca tej sekcji (`npx --yes github:isaacs/rimraf --help`, exit 0) była
> przeprowadzona **lokalnie**, na npm ≥ 11, gdzie defekt nie występuje — czyli w innym
> środowisku niż jedyne, w którym to polecenie miało realnie biec. To jest właściwy
> wniosek z tej pomyłki: weryfikacja poza środowiskiem docelowym nie jest weryfikacją.
>
> Obowiązujący mechanizm: workflow ściąga kit przez drugi krok `actions/checkout`
> (`repository: monterail/repobrain`, `ref: <PELNY_SHA>`, `path: .repobrain`) i uruchamia
> `node .repobrain/bin/knowledge.mjs`. Kit nie ma zależności, więc npm był w tym łańcuchu
> wyłącznie pośrednikiem — usunięcie go naprawia błąd i skraca joba.
>
> **Analiza trade-offu poniżej pozostaje w mocy w całości**: dotyczyła wyboru „kod
> ściągany zdalnie po pinie" kontra „vendoring", a nie tego, które narzędzie go ściąga.
> Pin po pełnym SHA i wszystkie jego gwarancje są bez zmian.

### Uczciwe uzasadnienie zdalnego pobierania zamiast vendoringu

Pierwotny spec uzasadniał `npx` zdaniem „usuwamy z systemu ostatnią kopię". To była retoryka: zlewała **kopię wiedzy** (dryfuje względem prawdy — szkodliwa) z **kopią narzędzia** (nazywa się vendoringiem, jest normalna; `node_modules` to same kopie).

Prawdziwy trade-off:

| | `npx github:#SHA` | vendoring skryptów w repo |
|---|---|---|
| Poprawka w kicie | jeden bump SHA na projekt | copy-paste do każdego repo |
| Działa offline / przy awarii GitHuba | **nie** | tak |
| Powierzchnia supply-chain | zdalny kod (ograniczony pinem SHA) | zero |
| Przechodzi review w projekcie | nie | tak |

Wybieramy `npx`, bo centralna poprawka jest ważniejsza przy 2+ projektach, a pin po SHA zamyka główne ryzyko. **Ryzyko rezydualne, zapisane świadomie:** przy awarii GitHuba merge'e stają we wszystkich projektach, a `continue-on-error: true` dodane pod presją deadline'u ma tendencję do pozostawania na zawsze.

Weryfikacja wykonalności: `npx --yes github:isaacs/rimraf --help` uruchomił CLI wprost z repo GitHuba (2026-07-28, exit 0).

### Niezmiennik architektoniczny

> `lib/` nie może zależeć ani od API Claude Code, ani od API GitHub Actions.

Naruszenie — np. czytanie kontekstu sesji w generatorze — wyłączyłoby kit w CI, czyli w jedynym miejscu, gdzie egzekwowanie realnie następuje.

### Zysk z pluginu ponad scaffolding

Skill `decisions-format` sprawia, że agent piszący wpis DEC używa właściwego formatu bez niczyjej interwencji — ta sama własność „przeżywa ludzi ignorujących konwencję", tyle że po stronie agenta zamiast CI.

## 6. Wdrożenie

### 6.1 Instalacja

`/knowledge-init` albo `npx … init` tworzy `docs/DECISIONS.md` (szkielet z opisem formatu i DEC-001 jako przykładem), workflow oraz dopisuje do `CLAUDE.md` regułę pierwszeństwa i pustą parę znaczników.

Instalator **nigdy nie nadpisuje istniejących plików**; raportuje, co dołożył, a co pominął. Dzięki tej regule ten sam kod obsługuje repo puste i dwutygodniowe, bez osobnego trybu.

Ręcznie uzupełnia się dwie rzeczy: listę ścieżek decyzyjnych w workflow i włączenie branch protection.

`Transcripts/` ani `HYPOTHESES.md` nie są scaffoldowane — powstają przy pierwszym użyciu `/transcript-extract`.

### 6.2 Właściciel

`DECISIONS.md` **ma przypisanego właściciela** — domyślnie PM projektu. Audyt poprzedniego projektu sformułował prawo „każdy magazyn wymaga właściciela i tempa aktualizacji"; spec bez tego przydziału powtarzałby błąd, który opisuje.

Zakres roli: uruchamia `/transcript-extract` po callach z klientem, przegląda raport `/knowledge-audit` raz na sprint, decyduje o rozszerzeniu ścieżek decyzyjnych.

**Zielone CI nie znaczy zdrowy second brain.** Bramki pilnują świeżości derywaty przy zmianach *kodu*. Decyzja z calla, która nie dotyka ścieżek decyzyjnych („klient potwierdził, że pakiet premium zawiera X"), nie ma żadnej bramki — jej jedyną drogą do repo jest człowiek. Dlatego rola jest przypisana, a nie dorozumiana.

### 6.3 Retrofit istniejących repo — odroczone

Tamten projekt i inne działające projekty pozostają nietknięte. Kit jest projektowany tak, żeby retrofit był możliwy później (instalator nie nadpisuje, generator odmawia nadpisania nie-swoich plików), ale migracja formatu istniejących wpisów nie jest budowana ani testowana.

## 7. Weryfikacja

**Testy jednostkowe** (`node:test`, zero zależności):

| Przypadek | Oczekiwanie |
|---|---|
| DEC bez relacji | aktywny |
| DEC odwrócony przez późniejszy | nieaktywny, ląduje w historii |
| DEC **zmieniony** przez późniejszy | **aktywny**, z adnotacją „zmienione przez" |
| łańcuch `Odwraca` A ← B ← C | aktywny wyłącznie C |
| `Zmienia:` na wpis już odwrócony | ostrzeżenie — zmiana martwej decyzji |
| relacja wskazuje na nieistniejący DEC | błąd |
| relacja wskazuje na **późniejszy** DEC | błąd |
| równa data, relacja wskazuje wyższe ID | błąd |
| duplikat ID | błąd |
| nagłówek `## ` niebędący poprawnym DEC | **twardy błąd**, nigdy ciche pominięcie |
| separator `-` / `–` / `—` w dacie | wszystkie akceptowane |
| `Źródło:` wskazuje na nieistniejący plik | błąd |
| `Podjął:` wskazuje klienta, brak `Źródło:` | błąd |
| nawias w treści (`[modal z ostrzeżeniem]`) | **nie** jest placeholderem |
| `CLAUDE.md` bez znaczników | błąd z instrukcją `init`, nigdy dopisanie na końcu |

**Fikstury modelowane na realnych patologiach tamtego projektu:** para DEC-015/DEC-033 (pełne odwrócenie przy `Status: decided` w oryginale), para DEC-036/DEC-039 (doprecyzowanie — rdzeń obowiązuje dalej), wpis z placeholderem `[data]`, wpis z legalnym nawiasem w treści.

**Test end-to-end** w świeżym repo tymczasowym:

| # | Krok | Oczekiwanie |
|---|---|---|
| 1 | `init` | dwa pliki + zmodyfikowany `CLAUDE.md` |
| 2 | DEC-002 z `Odwraca: DEC-001`, potem `index` | DEC-001 znika z aktywnych |
| 3 | DEC-003 z `Zmienia: DEC-002`, potem `index` | oba aktywne, DEC-002 z adnotacją |
| 4 | `check` bez regeneracji | czerwone (`index-fresh`) |
| 5 | `index`, potem `check` | zielone |
| 6 | zmiana w ścieżce decyzyjnej bez `DECISIONS.md` | czerwone (`decision-required`) |
| 7 | to samo z etykietą `no-decision` | zielone |

Kroki 6-7 wymagają sfabrykowanego `GITHUB_EVENT_PATH` — poza kontekstem PR bramka jest pomijana (§4.4).

## 8. Świadomie poza zakresem (YAGNI)

- **Generowany `docs/README.md`** — usunięty po recenzji. Jako bramka blokująca byłby najczęstszym czerwonym CI o najmniejszej wartości: każdy dodany raport QA czerwieniłby build, także PM-owi bez Node'a. A automatyczna lista wszystkich plików to `ls -R` w markdownie — problem sierot z audytu (C5) to brak **kuracji**, nie brak listy. Zamiast pliku: `/knowledge-audit` raportuje dokumenty, do których nic nie linkuje.
- **Ręczna sekcja „Fakty" w `CLAUDE.md`** — usunięta z modelu; patrz §3.
- **Decyzje warunkowe i wygasające** (`obowiązuje, jeśli Meta odrzuci template`; `do 2026-12-31`) — brak reprezentacji. Przy projekcie 6-9 miesięcznym akceptowalne; wrócić, gdy pojawi się drugi taki przypadek.
- **Retencja transkryptów po zakończeniu projektu** — nagrania rozmów z klientem w historii gita na zawsze to kwestia umowna i RODO, gdy klient zażąda usunięcia. Kit tego nie rozwiązuje; do ustalenia przy pierwszym handoverze.
- **Wykrywanie sprzeczności semantycznych między dokumentami** — kosztowne i zawodne.
- **Migracja specyfikacji z HTML do Markdown** — osobna decyzja.
- **Indeksowanie treści transkryptów** — materiał dowodowy czytany na żądanie, nie materiał do recall.
- **Parsowanie surowych PDF-ów w CI** — zadanie dla agenta z człowiekiem w pętli, nie dla bramki.
- **Automatyczny zapis pozycji z transkryptu** — `/transcript-extract` produkuje drafty do akceptacji.
- **Śledzenie statusu action itemów w repo** — zadania mają cykl życia Jiry, nie gita.
- **Hook lokalny / pre-commit** — automat piszący do repo bez człowieka jest przyczyną defektu, który naprawiamy.
- **Wsparcie dla repo bez Node** — uniwersalność kosztowałaby prostotę.
- **Retrofit istniejących repo, w tym tamtego** — patrz §6.3.

## 9. Kwestie otwarte

| # | Kwestia | Właściciel |
|---|---|---|
| O-1 | Zgoda zespołu na blokujące bramki + branch protection, zanim wejdą w pierwszy projekt | Dominik |
| O-2 | Lokalizacja repo kitu w orgu Monterail i kto nim administruje (uprawnienia do pushu = zaufanie supply-chain) | Dominik |
| O-3 | Kto jest właścicielem `DECISIONS.md` w pierwszym projekcie — PM czy dev lead | Dominik |
| O-4 | Lista ścieżek decyzyjnych — znana dopiero po kickoffie | odroczone z założenia |

**Ryzyko przyjęte świadomie:** bez wdrożenia w tamtym projekcie kit nie zostanie zweryfikowany na realnym projekcie przed pierwszym użyciem. Test end-to-end pokrywa mechanikę, nie ergonomię. Pierwszy projekt jest zarazem pierwszym testem tego, czy zespół zechce pisać wpisy DEC — dlatego kit jest celowo mały, a poprawka po pierwszym tygodniu tania.
