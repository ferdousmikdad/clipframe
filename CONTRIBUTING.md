# Contributing

Thanks for helping! Bug reports, new blocks, docs and examples are all welcome.

## Setup

```bash
git clone https://github.com/ferdousmikdad/clipframe.git
cd clipframe
npm install
npm run build
npm test
npm run demo      # playground on http://localhost:5173
```

## Adding a built-in block

1. Add `src/blocks/blocks/<id>.ts` (copy a small one such as `lower-third.ts`).
2. Register it in `src/blocks/index.ts` and add its id to `test/blocks.test.ts`.
3. Run `npm run docs` to update `docs/blocks.md`.
4. Render it to check it: `node bin/clipframe.js still my-test.json -t 1`.

Keep blocks deterministic: draw only from `t`, `props` and `theme`. See [docs/custom-blocks.md](docs/custom-blocks.md).

## Pull requests

- `npm run typecheck && npm test` should pass.
- Keep the change focused, and say what you checked (for example, "rendered the examples").
- Only add assets (fonts, images, sounds) you have the right to share under an open license.
