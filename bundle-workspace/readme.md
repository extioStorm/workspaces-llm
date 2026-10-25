# Bundle Workspace

Packs your project's readable text files into **one XML, Markdown or plain-text document** for ChatGPT, Claude, Gemini and other AI/LLM tools. No copying files one by one.

Source code: https://github.com/extioStorm/workspaces-llm

> **Lightweight on purpose.** This plugin aims to be simple and good enough for sending a project to an LLM. It is not meant to cover every edge case. If you want a full-featured packer, use the Repomix tool through the companion plugin **ARepomixGUI**, a graphical wrapper for Repomix.

> **Tap the gear icon (⚙) next to this plugin in Settings → Plugins** for its settings.

---

## Quick start

1. Open your **project's own folder** in Acode (see "Which folder is bundled?" below).
2. Open any file from that project.
3. Tap the **Bundle Workspace** button on the screen edge, run the **Bundle Workspace** command, or tap **Bundle workspace now** at the bottom of the settings page.
4. A checklist appears. Uncheck anything you don't want, then tap **Bundle**.
5. A new, unsaved tab opens with the bundle. Select all and copy it, or save it. (Turn on **Save the bundle in the project folder** and it is saved for you and opened as that file.)

---

## The checklist

Every file starts checked. Unchecking a folder unchecks everything inside it, and tapping a folder name collapses it. The header shows how many files are selected and the approximate tokens. Buttons: **All**, **None**, **Settings**, **Cancel**, **Bundle**.

**Settings** closes the checklist and opens this plugin's settings page. Change what you like, then tap **Bundle workspace now** at the bottom: the page closes and a fresh checklist appears with the new settings applied.

**Dotfiles** (names starting with a dot, like `.eslintrc`, and files inside hidden folders like `.github/`) are listed but start **unchecked** while **Start dotfiles unchecked** is on. **Possible secrets** (`.env`, `*.pem`, `*.key`, `id_rsa` and similar) are listed too, always start unchecked, and are labeled.

Earlier bundles in the project (your output name, plus `repomix-output…` files) are listed too. They start **unchecked** so an old bundle doesn't get packed into a new one, but you can tick one to include it.

Turn the checklist off with **Choose files before bundling**.

---

## What gets bundled

**Included:** every file in the project, whatever its name or extension, except what's skipped below. Files are opened and checked, so unusual languages like `.vue` or `.lua` just work.

**Skipped automatically:**
- Dependency and build folders such as `node_modules`, `vendor`, `dist`, `build`, `coverage`, `.git`, `.idea`, `.vscode`, `.next`, `.cache`, plus any you add in **Extra folders to skip**
- Obvious binaries by name (images, fonts, PDFs, archives, audio, video, compiled files), and any other file whose content turns out to be binary
- Files over the size limit
- Anything matched by the project's top-level `.gitignore` (basic patterns), if **Respect .gitignore** is on

With the checklist turned off, possible secrets are always left out, and dotfiles are left out when **Start dotfiles unchecked** is on.

**Output formats:** `xml` (each file in a `<file path="…">` tag with CDATA content), `markdown` (each file under a heading in a fenced block) or `plain` (files between `====` lines). The file name is **Output file name** plus the right extension.

---

## Which folder is bundled?

- By default the plugin uses the **folder opened in Acode's sidebar** that contains your active file.
- If none matches, it uses the active file's folder, moved up by **Fallback root** (0 = the file's own folder, 1 = its parent, and so on).
- The top of the bundle shows a `Root:` line so you can check what was used.

Android doesn't let apps open the very top of storage, so the highest folder Acode can usually open is something like **Documents**. Open your **project's own folder** inside it. If you open Documents itself, everything in it is bundled.

---

## Settings

| Setting | What it does |
|---|---|
| Output file name | Name without extension (default `bundled-workspace`) |
| Output format | `xml`, `markdown` or `plain` |
| Blank lines | `keep as is`, `collapse 3+ to 1` (default), `collapse 2+ to 1` or `remove all`. Works on every line break in a file, including inside strings, so `remove all` can change string contents |
| Choose files before bundling | Show the checklist |
| Start dotfiles unchecked | Dotfiles are listed but start unchecked (on by default) |
| Save the bundle in the project folder | Write the bundle into the packaged folder, named from Output file name (a file with that name is replaced), and open that file in a tab. If it can't be saved, an unsaved tab opens instead |
| Include directory tree | Add a file tree at the top |
| Respect .gitignore | Apply the top-level `.gitignore` (basic patterns: folders, `*.ext`, leading `/`, `**`) |
| Use open project folder as root | Prefer the opened sidebar folder |
| Fallback root (levels up) | Used when no opened folder matches |
| Show side button | Show or hide the button on the screen edge |
| Max files / Max file size (KB) / Max total characters | Safety limits |
| Extra folders to skip | Comma-separated folder names |
| Bundle workspace now | Run it right from settings |

---

## Tips and limits

- **Review the bundle before sharing it.** The filters catch common secrets but cannot catch everything, and your code may be proprietary.
- If the bundle is too large, uncheck folders or lower the limits.
- Only the top-level `.gitignore` is read, not ones inside subfolders.
- Token counts are rough estimates (about 4 characters per token).

---

Written with AI assistance (Claude by Anthropic) and tested by hand on a phone. MIT licensed.
