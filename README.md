# repoBrain

Warstwa wiedzy dla projektów klienckich, trzymana w repo i egzekwowana przez CI.

Jedno źródło prawdy (`docs/DECISIONS.md`), z którego generowany jest skrót aktywnych decyzji
wprost do `CLAUDE.md`. Rozjazd między nimi jest niemożliwy dłużej niż jeden PR, bo bramka CI
regeneruje i porównuje — tak jak check lockfile'a.

Dystrybucja dwiema ścieżkami z jednego repo: **plugin Claude Code** (skille + komendy dla zespołu)
oraz **CLI przez `npx`** (bramki w GitHub Actions, bez zależności od Claude Code).

## Status

Zaimplementowane, 90+ testów (`npm test`). Projekt: [`docs/design/2026-07-28-repobrain-design.md`](docs/design/2026-07-28-repobrain-design.md),
plan implementacji: [`docs/plans/2026-07-28-repobrain-implementation.md`](docs/plans/2026-07-28-repobrain-implementation.md).

## Skąd to się wzięło

Z audytu warstwy wiedzy w zakończonym projekcie klienckim: pięć równoległych magazynów,
ręcznie utrzymywane kopie rozjechały się ze źródłem, a hook synchronizujący commitował cudzą
pracę pod fałszywym komunikatem. Wspólna przyczyna wszystkich defektów była jedna —
**kopia utrzymywana ręcznie zawsze się rozjedzie**. repoBrain zastępuje kopie derywatą.
