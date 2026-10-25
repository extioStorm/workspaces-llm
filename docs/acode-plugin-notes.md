# Acode plugin notes

Working notes from building **Bundle Workspace** and **ARepomixGUI**. Every fact is tagged with how we know it:

- **[source]** read in Acode's source code (Acode-Foundation/Acode, `main` branch, October 2026). Your installed version may be older.
- **[device]** confirmed by testing on a real phone.
- **[guess]** not verified. Treat as an idea.

---

## Plugin basics

- Entry point: `acode.setPluginInit(id, initFn, settings)` and `acode.setPluginUnmount(id, fn)`. **[source]**
- `settings` is `{ list, cb }`. Passing it is what gives the plugin a gear icon and settings page. `list` can be a getter, so values are fresh each time the page opens. `cb(key, value)` runs when a row changes. **[source, device]**
- Settings rows (`ListItem`): `key`, `text`, `info`, `value`, `checkbox` (boolean), `select` (array of choices), `prompt` + `promptType` (text or number), `category`, `chevron`, `hidden`, `icon`. **[source]** (`select` works but is missing from Acode's own type comment.)
- A row with no `value`, `checkbox` or `select` acts as a button: `cb` is called with its key. **[device]**
- The page is built with `preserveOrder: true`, so rows keep the order of the list. Rows can be grouped by `category`. **[source]**
- Saved values live in `acode.require("settings").value[PLUGIN_ID]`; call `.update()` after changing them. **[device]**
- `acode.require("settings").uiSettings["plugin-<id>"]` is the plugin's settings page object. Acode's own gear button calls `.show()` on it, so a plugin can too. **[source]** The page object also has `hide()` (closes the page) and `onClose(callback)` (runs when it closes; returns a function to unregister). So a plugin can close its own settings page, e.g. `acode.require("settings").uiSettings["plugin-" + PLUGIN_ID].hide()`. **[source]** Not tried on a device yet.
- The plugin also needs `plugin.json` (with `icon` and `readme` files in the zip). Tapping the plugin name errors without them. **[device]**

## Modules a plugin can `acode.require(...)`

Includes: `settings`, `fsOperation`, `commands`, `terminal`, `sideButton`, `confirm`, `prompt`, `fileBrowser`, `openfolder` / `addedfolder`, `EditorFile`, `helpers`, `palette`, `keyboard`, `projects`, `lsp`, `codemirror`. **[source]**

- `acode.alert(title, message)`, `acode.confirm(title, message)` (returns a promise of true/false), `window.toast(message, ms)`. **[device]**
- `acode.require("sideButton")` is a constructor: `SideButton({ text, icon, onclick })`, then `.show()` / `.hide()`. **[device]**

## Commands

- `acode.require("commands")` exposes only `addCommand(descriptor)`, `removeCommand(name)` and `registry` (`add`, `execute`, `remove`, `list`). **[source]**
- A descriptor is `{ name, description, exec }`. `exec` returns a value, not the promise of an async function. **[device]**
- Built-in commands include `save` and `save-as`. Running one on the active tab would be `registry.execute("save")`. **[source]** for the names; **[guess]** for how `execute` takes its arguments. Not tried.

## Files and folders

- `fsOperation(uri)` gives an object with `lsDir`, `stat`, `readFile("utf8")`, `writeFile`, `createFile(name, text)`, `exists`. **[device]**
- Folder entries may report directory-ness as `isDirectory`, `isDir`, or `type`; check all three, then fall back to `stat()`. **[device]**
- `stat()` on the phone did **not** give a numeric `size`, so token counts showed 0. The code now accepts `size` or `length` and falls back to reading the file. **[device]**
- Folder addresses are `content://com.android.externalstorage.documents/tree/primary%3AProjects::primary:Projects/app`. To turn that into a terminal path: take the part after `/tree/`, URL-decode it, split on `::`, and use the document part (else the tree part) as `volume:relative/path`. `primary` becomes `/storage/emulated/0`; another volume becomes `/storage/<id>`. **[device]**
- Android only lets Acode open down to a folder like `Documents`, not the top of storage. **[device]**
- Open folders are in `window.addedFolder` (entries have `url`). Match the active file's location against them to find the project root. **[device]**
- `window.editorManager.activeFile` has `location` and `uri`. **[device]**

## Editor tabs

- `acode.newEditorFile(name, { text, render: true, editable: true, isUnsaved: true })` opens a new tab. It returns nothing, but the new tab becomes `editorManager.activeFile`. **[source, device]**
- Tab objects have `save()` and `saveAs()` (both return a promise of true/false). A tab with no location opens Acode's save dialog; it is not silent. **[source]**

## Terminal (Alpine)

- `acode.require("terminal").create({ name })` opens a tab and returns `{ id }`. `terminal.write(id, text + "\r")` types into it. There is no way to read its output. **[device]**
- The shell needs about 1.2 seconds to start. Send commands one at a time about 150 ms apart. **[device]**
- `window.Terminal.isInstalled()` says whether Alpine is set up. **[device]**
- `terminal.write` passes everything through a safety filter that blocks things like `rm -rf /`, `curl … | sh`, `chmod 777 /`, and `cat /etc/passwd`. A blocked command shows a toast and is silently dropped. Ordinary commands, including `$(…)` substitution, passed. **[source, device]**
- Inside the terminal, `acode <file>` opens a file in an Acode tab. **[device]**
- `apk add nodejs npm` then `npm install -g repomix@latest` installs Repomix. **[device]**

## Repomix command line (as of October 2026)

- `repomix --help` lists all flags (run it in the Alpine terminal for the current list). Useful ones for a GUI: `--style`, `-o/--output`, `--compress`, `--remove-comments`, `--remove-empty-lines`, `--include`, `-i/--ignore`, `--no-gitignore`, `--no-dot-ignore`, `--token-budget`, `--split-output`, `--remote`. **[device]**
- A `.repomixignore` file in the project is read automatically. Patterns are gitignore-style; a leading `/` anchors to the project root and a trailing `/` marks a folder. **[device]**
- `repomix --init` asks questions, so plugins should write `repomix.config.json` themselves. **[device]**
- Repomix packs dotfiles (including `.repomixignore` and `repomix.config.json`) unless they are ignored. **[device]**

## Languages

- `acode.require("editorLanguages")` has `getForPath(path)` (language mode for a file name, the same way the editor chooses), `list()`, `get(name)`, and `register(name, extensions, caption, loader, options)`. Each mode has a `loader` that supplies the CodeMirror language. **[source]**
- Idea, untested: load a mode's language, parse a file, and walk the tree for string and comment nodes, so a blank-line remover can skip blank lines inside strings. `codemirror` and `@lezer/common` are exposed to plugins. **[guess]**

## Gotchas we hit

- Android folder addresses and terminal paths are different worlds; convert, don't reuse.
- Test with a fake Acode in Node first, but always confirm on the phone: the fake `stat` returned `size`, the real one didn't.
