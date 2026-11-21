# Third-party notices

Clipframe is MIT licensed. It bundles and depends on the open-source work below, which keeps its own licenses.

## Bundled

| What | License | Text |
|---|---|---|
| Inter, Poppins, Hind Siliguri, Noto Sans Bengali (in `fonts/`) | SIL Open Font License 1.1 | `licenses/OFL-*.txt` |
| Lucide icons (through the `lucide` package) | ISC | `licenses/lucide-LICENSE.txt` |

## npm dependencies

| Package | License | Used for |
|---|---|---|
| [zod](https://github.com/colinhacks/zod) | MIT | Project and block schemas |
| [lucide](https://github.com/lucide-icons/lucide) | ISC | Icons in blocks |
| [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) | MIT | Writing the MP4 file |
| [mediabunny](https://github.com/Vanilagy/mediabunny) | MPL-2.0 | Decoding video and audio for export (used unmodified; MPL-2.0 is file-level copyleft and allows use in MIT and proprietary projects) |
| [playwright-core](https://github.com/microsoft/playwright) | Apache-2.0 | Driving headless Chrome for the CLI |

Clipframe does not contain or depend on Remotion code. Its `motion` helpers are an independent implementation with a familiar API.
