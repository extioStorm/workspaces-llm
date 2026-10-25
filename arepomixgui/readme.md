# ARepomixGUI

A graphical wrapper for [Repomix](https://github.com/yamadashy/repomix) in Acode. Repomix packs a whole project into one AI-friendly file. This plugin saves you from typing commands on a phone: it opens Acode's Alpine terminal, goes to your project folder, builds the command, and runs it for you.

Source code: https://github.com/extioStorm/workspaces-llm

> **What this plugin is, and isn't.** It only orchestrates the Repomix command line: folder, ignores, flags and config. Repomix does the actual packing, so how files are read, filtered, counted or formatted is Repomix's behavior, and bugs or questions about that belong to the [Repomix project](https://github.com/yamadashy/repomix). If you want something lighter that doesn't need Node.js, use the companion plugin **Bundle Workspace**.

> **Tap the gear icon (⚙) next to this plugin in Settings → Plugins** for everything this plugin does.

---

## Setup (once)

All of these are buttons on the settings page.

1. **Check if Repomix is installed** opens a terminal tab and says whether it is.
2. **Install or update Repomix** asks first, then installs Node.js, npm and the latest Repomix in Acode's Alpine terminal. It needs an internet connection and may take a few minutes.
3. **Create config and ignore files** (optional) writes `repomix.config.json` and `.repomixignore` into your project with Repomix's default contents. It asks first and never changes a file that already exists.

---

## Quick start

1. Open your **project's own folder** in Acode (see "Which folder is used?").
2. Open any file from the project.
3. Run **ARepomixGUI: Run Repomix** from the command palette, tap **Run Repomix now** on the settings page, or turn on **Show side button**.
4. A checklist appears. Uncheck anything you don't want, then tap **Run**.
5. A terminal tab named "Repomix" runs `repomix` in your project folder, with the flags you've chosen. When it finishes, the result opens in an Acode tab.

---

## The checklist

It lists files without reading them, so it opens quickly. Unchecking a folder unchecks everything inside it, and tapping a folder name collapses it. The header shows the selected count, approximate tokens and number of exclusions. Buttons: **All**, **None**, **Settings**, **Cancel**, **Run**.

**Settings** closes the checklist and opens this plugin's settings page. Change what you like, then tap **Run Repomix now** at the bottom: the page closes and a fresh checklist appears.

Some rows start **unchecked**:
- **Earlier bundles** (your output file name, plus `repomix-output…` files).
- **Repomix files**: `repomix.config.json` and `.repomixignore`.
- **Possible secrets**: `.env`, `*.pem`, `*.key`, `id_rsa` and similar.

Other hidden files such as `.gitignore` or `.dockerignore`, and files inside hidden folders like `.github/`, are listed and start checked, unless **Start dotfiles unchecked** is on. `.git` and `.DS_Store` are not listed.

**How unchecked files are excluded.** The plugin writes them into `.repomixignore`, which Repomix reads automatically. They live in a labeled block, `# >>> ARepomixGUI … # <<< ARepomixGUI`, that is **replaced on every run**. Your own lines outside the block are never touched, and a pattern you already have isn't added twice. If `.repomixignore` doesn't exist, the plugin asks before creating it. A run with nothing unchecked never creates the file. Turn off **Choose files before running** to skip the checklist, and the plugin sends nothing extra.

**Command-line fallback.** If you decline to create `.repomixignore`, or your config has `ignore.useDotIgnore` set to `false`, the exclusions are sent as `--ignore` instead (up to 20 items; a whole unchecked folder counts as one).

**Limits.** The ignores stay in `.repomixignore` after a run, because the plugin can't tell when Repomix finishes. **Clear plugin ignores** removes the block, and uninstalling or disabling the plugin removes it from the project you have open. The checklist only lists common text and code files, so an unusual file type that Repomix includes can't be unchecked there. A file that matches `.gitignore` is hidden from the list only when your config has `ignore.useGitignore` on (the default).

---

## Command options

**Command options (this run)** is a checkbox screen for Repomix's command line flags, with a live preview of the command at the bottom.

- **Common** (always visible): compress, remove comments, remove empty lines, leave out the file summary, leave out the directory tree, include only certain patterns, and a token budget.
- **Advanced** (tap to expand): line numbers, parsable output, metadata only, git diffs and logs, header text, instruction file, split output, token counting options, a custom config path, ignore switches, security check, watch mode, and a remote branch.
- Saved in this plugin's settings, not in your project, and added to every run. A flag here overrides the same option in `repomix.config.json`.
- **Extra flags** on the main page still takes anything not listed.
- **Run on the exclusions:** `Ignore .ignore / .repomixignore rules` stops the checklist's exclusions from working, because they live in `.repomixignore`. **Watch for changes** keeps the terminal running, so the output isn't opened automatically.

**Pack a remote repository** asks for a GitHub `user/repo` or URL and packs it with `--remote`, using the same flags. The result is written in the project folder if one is open.

---

## Config options

**Config options (repomix.config.json)** opens a checkbox screen for your `repomix.config.json`: file summary, directory structure, remove comments, remove empty lines, compress, line numbers, `.gitignore` and `.repomixignore` switches, security check, max file size, the custom ignore and include pattern lists, and git options.

- It changes only the values you touch, keeps every other key (including ones the screen doesn't know), and saves with **Save**.
- It works only on a plain-JSON config. If the file has comments or can't be read, it tells you and leaves it alone.
- Unlike Command options, this edits the config file in your project.
- **Edit config file (raw)** and **Edit .repomixignore (raw)** open either file in an editor tab, using the `acode` command in the Alpine terminal.

---

## Which folder is used?

- By default the plugin uses the **folder opened in Acode's sidebar** that contains your active file.
- If none matches, it uses the active file's folder, moved up by **Fallback root**.
- The terminal needs a Linux path, so the plugin converts Acode's folder address. Main storage becomes **Terminal path for main storage** (default `/storage/emulated/0`), and an SD card becomes `/storage/<id>/…`. If it ever picks the wrong folder, set **Terminal path override** to the exact path you use in the terminal. With an override set, the checklist and ignore file are skipped, because the plugin can't tell which project that is.

Android doesn't let apps open the very top of storage, so the highest folder Acode can usually open is something like **Documents**. Open your **project's own folder** inside it.

---

## Settings

| Setting | What it does |
|---|---|
| Check if Repomix is installed | Opens a terminal tab and reports |
| Install or update Repomix | Asks first, then installs Node.js, npm and the latest Repomix |
| Repomix command | `repomix` or `npx repomix` |
| Output format | `auto` (default), `xml`, `markdown`, `plain` or `json`. With `auto` the plugin passes no `--style`, so Repomix uses `output.style` from your config (xml if none) |
| Output file name | `(from config)` by default: uses `output.filePath` from `repomix.config.json`, or `repomix-output` with the right ending. Type the name only (any `.xml`, `.md`, `.txt` or `.json` you add is removed); the ending is added from Output format. With `auto`, type the full name including the ending |
| Command options (this run) | Checkbox screen for Repomix's flags, with a live command preview |
| Extra flags | Added to the command as-is, for flags not covered by Command options |
| Open output when finished | Opens the result in a tab with `acode` |
| Choose files before running | Show the checklist |
| Start dotfiles unchecked | Dotfiles start unchecked in the checklist (off by default) |
| Use open project folder as root | Prefer the opened sidebar folder |
| Fallback root (levels up) | Used when no opened folder matches |
| Show side button | Floating button on the screen edge (off by default) |
| Terminal path for main storage | What main storage is called inside Alpine |
| Terminal path override | Always run in this exact terminal folder |
| Config options (repomix.config.json) | Checkbox screen for `repomix.config.json` |
| Pack a remote repository | Packs a GitHub repo with `--remote` |
| Create config and ignore files | Writes both files with default contents |
| Edit config file (raw) / Edit .repomixignore (raw) | Open the file in an editor tab |
| Clear plugin ignores | Removes the plugin's block from `.repomixignore` |
| Run Repomix now | Run it right from settings |

---

## Tips

- **Review the output before sharing it.** Repomix has a security check, but it can't catch everything, and your code may be proprietary.
- Save any open `repomix.config.json` or `.repomixignore` tab before running or using the Options screen, so the plugin and the editor don't overwrite each other.
- If a terminal command seems to do nothing, open the Repomix terminal tab and look at its output.

---

Written with AI assistance (Claude by Anthropic) and tested by hand on a phone. MIT licensed.
