MIT License

Copyright (c) 2026 ai4rpg

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


Scope

The MIT grant above applies to the code and configuration except:
- the synced skill bodies in the `skills/` directory;
- the upstream test snapshots under `tests/fixtures/`;
- upstream persona text embedded in child preset descriptions and persona
  prefixes in `cordis.patch.yml`, including adaptations of those texts.

These originate from https://github.com/ai4rpg/tavern-cards,
Copyright (c) 2026 ai4rpg, and are licensed separately under Creative Commons
Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0):
https://creativecommons.org/licenses/by-nc-sa/4.0/
Legal text: https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode

Retain attribution and the license link, use non-commercially, and share
adaptations under the same license. The generator maps persona frontmatter
into child declarations and appends DSH reviewer instructions; upstream body
text is otherwise unchanged. Current upstream source:
https://github.com/ai4rpg/tavern-cards/tree/b90b2ce741a999b2a2729cf0fe842129e408b459
See also `skills/LICENSE.md` and the notices alongside the test snapshots.
