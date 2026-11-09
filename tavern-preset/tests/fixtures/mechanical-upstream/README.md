# Pinned upstream inputs

The four files under `tavern-cards/` are unmodified snapshots from
[ai4rpg/tavern-cards](https://github.com/ai4rpg/tavern-cards/tree/b90b2ce741a999b2a2729cf0fe842129e408b459),
commit `b90b2ce741a999b2a2729cf0fe842129e408b459` (main).

Copyright (c) 2026 ai4rpg. These snapshots are **CC BY-NC-SA 4.0**, not MIT:
[license](https://creativecommons.org/licenses/by-nc-sa/4.0/),
[legal text](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode).
Keep attribution, use non-commercially, and share adaptations under the same license.

They are independent test inputs, not another runtime rule implementation.
`tests/mechanical-engine.spec.ts` pins their original Git blob identities,
applies the current adapter, and runs the real sync pipeline in a temporary
directory to compare complete generated files. This catches manual drift in
both the script and documentation without requiring git, a sibling checkout,
or network access during tests.

When an approved main sync changes one of these inputs, replace it directly
with `git show <approved-main-sha>:tavern-cards/<path>` (never reverse the
current generated file), update the blob identities and this source reference,
then inspect the regenerated outputs. This fixture is test-only and is not
included in the installed preset package.
