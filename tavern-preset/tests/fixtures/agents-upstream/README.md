# Pinned persona inputs — test fixtures only

`agents/*.md` are unmodified upstream inputs from
[ai4rpg/tavern-cards](https://github.com/ai4rpg/tavern-cards/tree/b90b2ce741a999b2a2729cf0fe842129e408b459),
main commit `b90b2ce741a999b2a2729cf0fe842129e408b459`.
They are **not the generator's default source**, a content package, or runtime
files. They only make ordinary tests independent of a developer's checkout.
`agents-source.spec.ts` verifies their Git blob identities and validation;
`preset.spec.ts` explicitly injects them for the generated-artifact equation.
Production regeneration instead requires `TAVERN_CARDS_ROOT` to name an
approved upstream main checkout or exported snapshot. Update these fixtures
from that approved source when changing personas, never from generated YAML.

Copyright (c) 2026 ai4rpg. The snapshots are licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
([legal text](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode)),
not MIT: retain attribution, use non-commercially, and share adaptations under
the same license. No modifications were made to the source files.
These test-only files are excluded from the installed preset package.
