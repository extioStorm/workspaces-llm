# Bundle Workspace

Packs your project’s readable source files into **one XML or Markdown document** for ChatGPT, Claude, Gemini, and other AI/LLM tools. No copying files one by one.

Source code: https://github.com/extioStorm/workspaces-llm

> **Start here: tap the gear icon (⚙) next to this plugin in Settings → Plugins.**
> That settings page is where you control everything this plugin does. The landing page you are reading only explains it.

---

## Quick start

1. Open your **project's own folder** in Acode (see "Which folder is bundled?" below).
2. Open any file from that project.
3. Tap the **Bundle Workspace** button on the screen edge, or run the **Bundle Workspace** command, or tap **Bundle workspace now** at the bottom of the settings page.
4. A checklist appears. Uncheck anything you don't want, then tap **Bundle**.
5. A new, unsaved tab opens with the bundle. Select all and copy it, or save it.

---

## Two ways to bundle

Pick the engine in settings under **Bundler engine**.

### 1. Built-in (default)
Runs inside Acode with nothing extra to install. It scans your project, lets you choose files, and opens the result in a new tab.

### 2. Repomix (optional alternate)
Uses the open-source [Repomix](https://github.com/yamadashy/repomix) tool instead. The plugin opens an Alpine terminal tab in Acode, goes to your project folder, and runs Repomix. Repomix writes its output file (usually `repomix-output.xml`) into your project folder, and you open it from the file list.

To use it:
1. In settings, tap **Check Repomix**. A terminal tab opens and tells you whether Repomix is installed.
2. Tap **Install Repomix** whenever you want to install or reinstall it. The confirmation explains that Node.js, npm and Repomix will be installed in Acode’s Alpine Linux terminal. Tap **OK** to start or **Cancel** to stop. An internet connection is required, and installation may take a few minutes.
3. Set **Bundler engine** to `repomix`.
4. Tap the Bundle Workspace button as usual. A terminal tab named "Repomix" opens and runs it.

To go back, set **Bundler engine** to `builtin`.

**Shared options.** These settings apply to both engines, and in Repomix mode they are turned into Repomix flags for you: Output format (`--style`), Include directory tree (`--no-directory-structure` when off), Collapse extra blank lines (`--remove-empty-lines`), Respect .gitignore (`--no-gitignore` when off), and Extra folders to skip (`--ignore`). Two extra checkboxes only apply to Repomix: **Repomix: compress code** and **Repomix: remove comments**. Anything else goes in **Repomix flags**, which is added at the end.

Things to know about Repomix mode:
- The plugin can start the command but cannot read its output or tell when it finishes. Watch the terminal tab for "Repomix finished", then open the output file yourself.
- The checklist, file limits and extra file extensions are built-in only. Repomix does its own file filtering.
- Collapse extra blank lines behaves differently: built-in shrinks 3+ blank lines to one, Repomix removes empty lines.

---

## Which folder is bundled?

- By default the plugin uses the **folder you opened in Acode's sidebar** that contains your active file.
- If no opened folder matches, it uses the active file's folder, moved up by the **Fallback root** setting (0 = the file's own folder, 1 = its parent, and so on).
- The top of the bundle shows a `Root:` line so you can check what was used.

Android does not let apps open the very top of storage, so the highest folder Acode can usually open is something like **Documents**. Open your **project's own folder** inside it. If you open Documents itself, everything in it will be bundled.

---

## What the built-in bundler does

**Scans** your project folder and everything inside it, and includes only readable text and code files.

**Skips automatically:**
- Hidden files and folders (names starting with a dot), including `.git` and `.env`
- Dependency and build folders: `node_modules`, `vendor`, `dist`, `build`, `coverage`, `.next`, `.cache` and similar
- Likely secrets such as keys, certificates and credential files
- Binary files, files over the size limit, and its own earlier bundles (`BUNDLE_WORKSPACE…`, `repomix-output…`)

**Lets you choose files.** After scanning, a full-screen checklist appears with every file checked. Unchecking a folder unchecks everything inside it. Tap a folder name to collapse it. A counter shows how many files are selected and the approximate tokens. Earlier bundles in the project (such as `repomix-output.xml`) are listed too, but greyed out, unchecked and locked, so you can see they were left out on purpose. Buttons: **All**, **None**, **Cancel**, **Bundle**.

**Builds the document** in your chosen format:
- `xml`: each file in a `<file path="…">` tag with its contents safely wrapped
- `markdown`: each file under a heading in a fenced code block

It can add a **directory tree** at the top, and can **collapse runs of blank lines** to save tokens. It reports an approximate token count when finished.

---

## Settings reference (⚙ page)

| Setting | What it does |
|---|---|
| Show side button | Show or hide the button on the screen edge |
| Output file name | Name of the new bundle tab |
| Bundler engine | `builtin` or `repomix` |
| Repomix command | Command used in the terminal (`repomix` or `npx repomix`) |
| Repomix flags | Extra flags passed to Repomix |
| Terminal path for main storage | What main storage is called inside Alpine (default `/storage/emulated/0`) |
| Terminal path override | Always run Repomix in this exact terminal folder |
| Repomix: compress code | Repomix only: adds `--compress` |
| Repomix: remove comments | Repomix only: adds `--remove-comments` |
| Check Repomix | Opens a terminal tab and reports if Repomix is installed |
| Install Repomix | Asks for confirmation, then installs/reinstalls Node.js, npm and Repomix in the Alpine terminal |
| Choose files before bundling | Show the checklist (built-in engine only) |
| Use open project folder as root | Prefer the opened sidebar folder |
| Output format | `xml` or `markdown` (both engines) |
| Include directory tree | Add a file tree at the top (both engines) |
| Collapse extra blank lines | Save tokens (both engines; works slightly differently) |
| Respect .gitignore | Apply the project's `.gitignore` (both engines). Built-in handles basic patterns: folders, `*.ext`, leading `/`, `**` |
| Fallback root: folders above active file | Used when no opened folder matches |
| Max files / Max file size (KB) / Max total characters | Safety limits |
| Extra folders to skip | Comma-separated folder names to ignore (both engines) |
| Extra file extensions | Comma-separated extensions to include, for example `.vue,.lua` (built-in only) |
| Bundle workspace now | Run it right from settings |

---

## Tips and limits

- **Review the bundle before sharing it.** The filters catch common secrets, but they cannot catch everything. Your code may be proprietary.
- If the bundle is too large, uncheck folders in the checklist or lower the limits in settings.
- If Repomix mode runs in the wrong folder, set **Terminal path override** to the exact path you use in the terminal.
- Only the top-level `.gitignore` is read, not ones inside subfolders.
- Token counts are rough estimates (about 4 characters per token).
