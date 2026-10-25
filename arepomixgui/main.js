(() => {
  "use strict";

  // ARepomixGUI: a graphical front end for the Repomix command line tool,
  // run in Acode's Alpine terminal. It orchestrates the CLI (project folder,
  // ignores, flags, config) and leaves Repomix's own behavior to Repomix.

  const PLUGIN_ID = "com.custom.arepomixgui";
  const TAG = "[ARepomixGUI]";

  const SKIP_DIRS = new Set([
    ".git", ".hg", ".svn", "node_modules", "vendor", "dist", "build",
    "coverage", ".idea", ".vscode", ".gradle", "__pycache__", ".next",
    ".cache"
  ]);

  const TEXT_EXTENSIONS = new Set([
    ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".html", ".htm",
    ".css", ".scss", ".sass", ".less", ".json", ".jsonc", ".md", ".mdx",
    ".txt", ".xml", ".svg", ".yml", ".yaml", ".toml", ".ini", ".py",
    ".java", ".kt", ".kts", ".c", ".h", ".cpp", ".hpp", ".cc", ".cs",
    ".go", ".rs", ".php", ".rb", ".swift", ".dart", ".sql", ".sh",
    ".bash", ".bat", ".ps1", ".gitignore", ".gitattributes",
    ".editorconfig", ".properties", ".gradle", ".mk", ".makefile"
  ]);

  const TEXT_NAMES = new Set([
    "dockerfile", "makefile", "gemfile", "procfile", "license",
    "notice", "readme", "changelog", "justfile"
  ]);

  const SECRET_NAMES = new Set([
    ".env", ".env.local", ".env.production", ".env.development",
    ".npmrc", ".pypirc", "id_rsa", "id_ed25519", "credentials.json",
    "secrets.json"
  ]);

  const MAX_DEPTH = 30;
  const MAX_SCAN_FILES = 5000;
  const FORMATS = ["xml", "markdown", "plain", "json"];
  const EXT = { xml: ".xml", markdown: ".md", plain: ".txt", json: ".json" };
  // Most ignore patterns sent on the command line (only used when
  // .repomixignore can't be used).
  const MAX_CLI_EXCLUSIONS = 20;

  const REPOMIX_CONFIG_NAME = "repomix.config.json";
  const IGNORE_NAME = ".repomixignore";
  const IGNORE_TEMPLATE =
    "# Add patterns to ignore here, one per line\n" +
    "# Example:\n" +
    "# *.log\n" +
    "# tmp/\n";

  // Block the plugin owns inside .repomixignore; replaced on every run.
  const IGNORE_BEGIN = "# >>> ARepomixGUI (replaced on every run; edit outside this block)";
  const IGNORE_END = "# <<< ARepomixGUI";

  // Same contents `repomix --init` writes, so no prompts are needed.
  const CONFIG_TEMPLATE = {
    "$schema": "https://repomix.com/schemas/latest/schema.json",
    input: { maxFileSize: 52428800 },
    output: {
      filePath: "repomix-output.xml",
      style: "xml",
      filePathStyle: "target-relative",
      parsableStyle: false,
      fileSummary: true,
      directoryStructure: true,
      files: true,
      removeComments: false,
      removeEmptyLines: false,
      compress: false,
      topFilesLength: 5,
      showLineNumbers: false,
      truncateBase64: false,
      copyToClipboard: false,
      includeFullDirectoryStructure: false,
      tokenCountTree: false,
      git: {
        sortByChanges: true,
        sortByChangesMaxCommits: 100,
        includeDiffs: false,
        includeLogs: false,
        includeLogsCount: 50
      }
    },
    include: [],
    ignore: {
      useGitignore: true,
      useDotIgnore: true,
      useDefaultPatterns: true,
      customPatterns: []
    },
    security: { enableSecurityCheck: true },
    tokenCount: { encoding: "o200k_base" }
  };

  // ---------- Settings ----------
  const DEFAULTS = {
    outputName: "",
    outputFormat: "auto",
    dotfilesUnchecked: false,
    repomixCommand: "repomix",
    repomixFlags: "",
    openOutput: true,
    showPicker: true,
    useProjectRoot: true,
    rootLevelsUp: 0,
    showSideButton: false,
    terminalBase: "/storage/emulated/0",
    terminalPathOverride: ""
  };

  const appSettings = acode.require("settings");

  const stripExt = (v) => String(v || "").trim().replace(/\.(xml|md|markdown|txt|text|json)$/i, "");
  const FORMAT_CHOICES = ["auto", ...FORMATS];

  function cfg() {
    let c = appSettings.value[PLUGIN_ID];
    if (!c) {
      c = appSettings.value[PLUGIN_ID] = { ...DEFAULTS, options: {} };
      appSettings.update(false);
      return c;
    }
    for (const k of Object.keys(DEFAULTS)) if (c[k] === undefined) c[k] = DEFAULTS[k];
    if (!c.options) c.options = {};
    return c;
  }

  const num = (v, fallback, min) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= min ? n : fallback;
  };


  // Output name and style for a run. `config` is the parsed repomix.config.json
  // (or null). Returns { name, style, passOutput }: style is the --style to pass
  // (null in auto), and passOutput says whether to pass --output.
  function resolveOutput(config) {
    const c = cfg();
    const auto = !FORMATS.includes(c.outputFormat);
    const typed = String(c.outputName || "").trim();
    const out = (config && config.output) || {};
    const cfgPath = typeof out.filePath === "string" && out.filePath.trim() ? out.filePath.trim() : "";
    const style = auto ? (FORMATS.includes(out.style) ? out.style : "xml") : c.outputFormat;
    const withEnd = (name) => (auto ? name : stripExt(name) + EXT[style]);
    if (typed) return { name: withEnd(typed), style: auto ? null : style, passOutput: true };
    if (cfgPath) return { name: withEnd(cfgPath), style: auto ? null : style, passOutput: !auto };
    return { name: "repomix-output" + EXT[style], style: auto ? null : style, passOutput: !auto };
  }

  // [key, label, info, type, extra]; "action" items are buttons.
  const ITEMS = [
    ["checkRepomix", "Check if Repomix is installed", "Opens a terminal tab and reports whether Repomix is installed.", "action"],
    ["installRepomix", "Install or update Repomix", "Asks first, then installs Node.js, npm and the latest Repomix in Acode's Alpine terminal. Needs an internet connection.", "action"],
    ["repomixCommand", "Repomix command", "repomix, or npx repomix.", "text"],
    ["outputFormat", "Output format", "auto, xml, markdown, plain or json. auto passes no --style, so Repomix uses output.style from your config (xml if there is none).", "select", FORMAT_CHOICES],
    ["outputName", "Output file name", "(from config) uses output.filePath from repomix.config.json, or repomix-output if there is none. Type a name to override it. Type the name only: the ending (.xml, .md, .txt or .json) is added from Output format. With auto, type the full name including the ending.", "text"],
    ["commandOptions", "Command options (this run)", "Checkboxes for Repomix's command line flags: the common ones on top, the rest under Advanced, with a live preview of the command.", "action"],
    ["repomixFlags", "Extra flags", "Anything not covered by Command options, added to the command as-is.", "text"],
    ["openOutput", "Open output when finished", "Opens the result in an Acode tab with the acode command.", "bool"],
    ["showPicker", "Choose files before running", "Show a checklist. Unchecked files are written to .repomixignore.", "bool"],
    ["dotfilesUnchecked", "Start dotfiles unchecked", "In the checklist, files and folders whose names start with a dot start unchecked. Off by default, so a plain run matches a plain repomix. Possible secrets and Repomix's own files always start unchecked.", "bool"],
    ["useProjectRoot", "Use open project folder as root", "Prefer the folder opened in Acode's sidebar that contains the active file.", "bool"],
    ["rootLevelsUp", "Fallback root (levels up)", "Used when no opened folder matches: 0 = the active file's folder, 1 = its parent (max 10).", "number"],
    ["showSideButton", "Show side button", "Show a floating button on the screen edge.", "bool"],
    ["terminalBase", "Terminal path for main storage", "What main storage is called inside Alpine (default /storage/emulated/0).", "text"],
    ["terminalPathOverride", "Terminal path override", "Always run in this exact terminal folder. Skips the checklist and the ignore file.", "text"],
    ["repomixOptions", "Config options (repomix.config.json)", "Edit repomix.config.json with checkboxes. Only the values you change are written.", "action"],
    ["createRepomixFiles", "Create config and ignore files", "Writes repomix.config.json and .repomixignore with Repomix's default contents. Never changes existing files.", "action"],
    ["editRepomixConfig", "Edit config file (raw)", "Opens repomix.config.json in an editor tab.", "action"],
    ["editRepomixIgnore", "Edit .repomixignore (raw)", "Opens .repomixignore in an editor tab.", "action"],
    ["clearPluginIgnores", "Clear plugin ignores", "Removes the block of ignores this plugin added to .repomixignore. Your own lines are not touched.", "action"],
    ["remoteRepo", "Pack a remote repository", "Asks for a GitHub user/repo or URL and packs it with --remote. The result is written in the project folder if one is open.", "action"],
    ["runNow", "Run Repomix now", "Run Repomix on the current project (open a project file first).", "action"]
  ];

  function settingsObject() {
    const c = cfg();
    const list = ITEMS.map(([key, text, info, type, extra]) => {
      const item = { key, text, info };
      if (type === "bool") item.checkbox = !!c[key];
      else if (type === "select") { item.value = c[key]; item.select = extra; }
      else if (type === "text" || type === "number") {
        if (key === "outputName") {
          item.value = !c.outputName ? "(from config)"
            : FORMATS.includes(c.outputFormat) ? stripExt(c.outputName) : c.outputName;
        } else {
          item.value = type === "text" && !c[key] ? "(none)" : c[key];
        }
        item.prompt = text;
        item.promptType = type;
      }
      return item;
    });

    const actions = {
      checkRepomix, installRepomix, repomixOptions: openRepomixOptions, createRepomixFiles,
      editRepomixConfig, editRepomixIgnore, clearPluginIgnores, commandOptions: openCommandOptions,
      remoteRepo: packRemote, runNow: runFromSettings
    };

    return {
      list,
      cb: function (key, value) {
        if (actions[key]) return actions[key]();
        const row = ITEMS.find((i) => i[0] === key);
        if (!row) return;
        const c2 = cfg();
        const type = row[3];
        if (type === "bool") c2[key] = !!value;
        else if (type === "select") c2[key] = row[4].includes(value) ? value : DEFAULTS[key];
        else if (type === "number") c2[key] = Math.min(num(value, 0, 0), 10);
        else if (key === "outputName") {
          const v = String(value || "").trim();
          const named = FORMATS.includes(c2.outputFormat);
          c2[key] = v === "(from config)" || v === "(none)" ? "" : named ? stripExt(v) : v;
          // The settings page shows what was typed; put the corrected name in its place.
          try {
            const shown = this && this.querySelector && this.querySelector(".setting-trailing-value");
            if (shown) shown.textContent = c2[key] || "(from config)";
          } catch (e) { /* display only */ }
          if (named && c2[key] && c2[key] !== v) toast("Saved as " + c2[key] + EXT[c2.outputFormat] + " (the ending follows Output format)");
        }
        else if (key === "repomixCommand") c2[key] = String(value || "").trim() || DEFAULTS[key];
        else if (key === "terminalBase") c2[key] = String(value || "").trim().replace(/\/+$/, "") || DEFAULTS[key];
        else c2[key] = value === "(none)" ? "" : String(value || "").trim();
        appSettings.update();
        if (key === "showSideButton") applySideButton();
      }
    };
  }

  // ---------- Helpers ----------
  let sideButton = null;
  let running = false;

  const toast = (m) => (typeof window.toast === "function" ? window.toast(m, 3000) : console.log(TAG, m));
  const normalizePath = (p) => String(p || "").replace(/\\/g, "/");
  const joinPath = (a, b) => normalizePath(a).replace(/\/+$/, "") + "/" + String(b || "").replace(/^\/+/, "");
  const basename = (p) => normalizePath(p).split("/").filter(Boolean).pop() || "";
  const extensionOf = (n) => { const d = n.lastIndexOf("."); return d > 0 ? n.slice(d).toLowerCase() : ""; };
  const isHidden = (n) => n.startsWith(".");
  const shellQuote = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

  const isDotted = (path) => path.split("/").some((part) => part.startsWith("."));
  const isSecret = (n) => SECRET_NAMES.has(n.toLowerCase()) || /\.(pem|key|p12|pfx|keystore|jks)$/i.test(n);
  const isTextFile = (n) => {
    const lower = n.toLowerCase();
    return TEXT_EXTENSIONS.has(extensionOf(lower)) || TEXT_NAMES.has(lower);
  };

  function showError(error) {
    console.error(TAG, error);
    if (typeof acode.alert === "function") acode.alert("ARepomixGUI", error.message || String(error));
    else toast(error.message || String(error));
  }

  async function confirmDialog(title, message) {
    try {
      if (typeof acode.confirm === "function") return !!(await acode.confirm(title, message));
    } catch (_) {}
    return window.confirm(title + "\n\n" + message);
  }

  function openFolders() {
    try {
      if (Array.isArray(window.addedFolder) && window.addedFolder.length) return window.addedFolder;
    } catch (_) {}
    try {
      const of = acode.require("openFolder");
      if (of && Array.isArray(of.addedFolder)) return of.addedFolder;
    } catch (_) {}
    return [];
  }

  function findProjectRoot(location, fileUri) {
    let best = "";
    for (const folder of openFolders()) {
      const raw = folder && (folder.url || folder.uri || folder.path);
      if (typeof raw !== "string") continue;
      const url = normalizePath(raw).replace(/\/+$/, "");
      if (!url) continue;
      const inside = [location, fileUri].some((p) => p && (p === url || p.startsWith(url + "/")));
      if (inside && url.length > best.length) best = url;
    }
    return best;
  }

  function getRootDirectory() {
    const active = window.editorManager && window.editorManager.activeFile;
    if (!active || !active.location) throw new Error("Open a file inside the project before running.");
    let dir = normalizePath(active.location).replace(/\/+$/, "");

    if (cfg().useProjectRoot) {
      const project = findProjectRoot(dir, normalizePath(active.uri || ""));
      if (project) return project;
    }

    const levels = 1 + num(cfg().rootLevelsUp, 0, 0);
    for (let i = 0; i < levels; i++) {
      const idx = dir.lastIndexOf("/");
      if (idx <= 0) break;
      const next = dir.substring(0, idx);
      if (/^[a-z][a-z0-9+.-]*:\/*$/i.test(next)) break; // don't climb past content://
      dir = next;
    }
    return dir || "/";
  }

  // Convert an Acode folder address into a path usable in the Alpine terminal.
  //   content://com.android.externalstorage.documents/tree/primary%3AProjects::primary:Projects/app
  //   -> /storage/emulated/0/Projects/app
  function toTerminalPath(uri, base) {
    let u = String(uri || "");
    const basePath = String(base || "/storage/emulated/0").replace(/\/+$/, "");
    const volumePath = (vol) => (vol === "primary" || vol === "" ? basePath : "/storage/" + vol);
    const join = (vol, rel) => {
      const clean = String(rel || "").replace(/^\/+|\/+$/g, "");
      return volumePath(vol) + (clean ? "/" + clean : "");
    };

    if (u.startsWith("file://")) {
      try { u = decodeURIComponent(u.slice(7)); } catch (_) { u = u.slice(7); }
      return u.replace(/^\/sdcard(?=\/|$)/, basePath);
    }

    const marker = "/tree/";
    const at = u.indexOf(marker);
    if (!u.startsWith("content://") || at < 0) return "";

    let rest = u.slice(at + marker.length);
    try { rest = decodeURIComponent(rest); } catch (_) {}

    const [treePart, docPart] = rest.split("::");
    const parse = (part) => {
      if (part === undefined) return null;
      const i = part.indexOf(":");
      return i < 0 ? { vol: part, rel: "" } : { vol: part.slice(0, i), rel: part.slice(i + 1) };
    };
    const doc = parse(docPart);
    const tree = parse(treePart);
    const pick = doc && doc.rel ? doc : tree;
    return pick ? join(pick.vol, pick.rel) : "";
  }

  // ---------- File access ----------
  async function fileExists(uri) {
    try { return !!(await acode.require("fsOperation")(uri).exists()); } catch (_) { return false; }
  }

  // The file's text, or null if it does not exist or can't be read.
  async function readTextFile(uri) {
    if (!(await fileExists(uri))) return null;
    try {
      const t = await acode.require("fsOperation")(uri).readFile("utf8");
      return typeof t === "string" ? t : null;
    } catch (_) {
      return null;
    }
  }

  async function writeTextFile(dirUri, name, text) {
    const fsOp = acode.require("fsOperation");
    const uri = joinPath(dirUri, name);
    if (await fileExists(uri)) await fsOp(uri).writeFile(text);
    else await fsOp(dirUri).createFile(name, text);
  }

  function parseConfig(text) {
    try {
      const obj = JSON.parse(String(text).replace(/^\uFEFF/, ""));
      return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : null;
    } catch (_) {
      return null;
    }
  }

  // ---------- Scanning (for the checklist; file contents are not read) ----------
  const entryName = (e) =>
    typeof e === "string" ? basename(e) : (e && (e.name || e.filename || basename(e.uri || e.url || e.path || ""))) || "";

  function entryPath(parent, e) {
    if (typeof e === "string") return e.includes("/") ? normalizePath(e) : joinPath(parent, e);
    const c = e && (e.uri || e.url || e.path);
    return typeof c === "string" && c ? normalizePath(c) : joinPath(parent, entryName(e));
  }

  const dirWord = /^(directory|dir|folder)$/i;

  async function isDirectory(fs, entry) {
    if (entry && typeof entry !== "string") {
      if (typeof entry.isDirectory === "boolean") return entry.isDirectory;
      if (typeof entry.isDir === "boolean") return entry.isDir;
      if (typeof entry.type === "string") return dirWord.test(entry.type);
    }
    try {
      const st = await fs.stat();
      if (st && typeof st.isDirectory === "boolean") return st.isDirectory;
      if (st && typeof st.isDir === "boolean") return st.isDir;
      if (st && typeof st.type === "string") return dirWord.test(st.type);
    } catch (e) {
      console.warn(TAG, "stat failed:", e);
    }
    return false;
  }

  const statSize = (st) =>
    st && typeof st.size === "number" ? st.size : st && typeof st.length === "number" ? st.length : null;

  // Basic .gitignore patterns, only used to hide what Repomix would skip too.
  function parseGitignore(text) {
    const rules = [];
    for (let line of String(text || "").split(/\r?\n/)) {
      line = line.replace(/\s+$/, "");
      if (!line || line.startsWith("#")) continue;
      let negate = false;
      if (line.startsWith("!")) { negate = true; line = line.slice(1); }
      let dirOnly = false;
      if (line.endsWith("/")) { dirOnly = true; line = line.replace(/\/+$/, ""); }
      if (!line) continue;
      const anchored = line.includes("/");
      line = line.replace(/^\/+/, "");
      const source = line
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*\/?/g, "\u0000")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
        .replace(/\u0000/g, ".*");
      try { rules.push({ negate, dirOnly, anchored, re: new RegExp("^" + source + "$") }); } catch (_) {}
    }
    return rules;
  }

  function isIgnored(rules, relPath, name, isDir) {
    let ignored = false;
    for (const r of rules) {
      if (r.dirOnly && !isDir) continue;
      if (r.re.test(r.anchored ? relPath : name)) ignored = !r.negate;
    }
    return ignored;
  }

  // Lists files for the checklist. Hidden files and secret-looking files are
  // listed too. Returns { files, previous, warnings }.
  async function scanProject(root, gitignore, outputBase) {
    const files = [];
    const previous = [];
    const warnings = [];
    const visited = new Set();
    let stopped = false;

    async function walk(directory, relative, depth) {
      if (stopped) return;
      if (depth > MAX_DEPTH) { warnings.push(`Maximum directory depth reached: ${relative || "."}`); return; }
      const normalized = normalizePath(directory);
      if (visited.has(normalized)) return;
      visited.add(normalized);

      let entries;
      try {
        entries = await acode.require("fsOperation")(normalized).lsDir();
      } catch (error) {
        warnings.push(`Cannot list ${relative || "."}: ${error.message || error}`);
        return;
      }
      if (!Array.isArray(entries)) return;

      for (const entry of entries) {
        if (stopped) return;
        const name = entryName(entry);
        if (!name || name === "." || name === ".." || name.toLowerCase() === ".ds_store") continue;

        const fullPath = entryPath(normalized, entry);
        const rel = relative ? `${relative}/${name}` : name;
        let fs;
        try { fs = acode.require("fsOperation")(fullPath); } catch (_) { continue; }

        const dir = await isDirectory(fs, entry);
        if (gitignore.length && isIgnored(gitignore, rel, name, dir)) continue;

        if (dir) {
          if (!SKIP_DIRS.has(name.toLowerCase())) await walk(fullPath, rel, depth + 1);
          continue;
        }

        const secret = isSecret(name);
        if (!secret && !isHidden(name) && !isTextFile(name)) continue;

        let size = null;
        try { size = statSize(await fs.stat()); } catch (_) {}

        // Earlier bundles: listed, but start unchecked.
        if (/^repomix-output/i.test(name) ||
            name.toLowerCase().startsWith(outputBase + ".")) {
          previous.push({ path: rel, size: size || 0 });
          continue;
        }

        if (files.length >= MAX_SCAN_FILES) { warnings.push(`File limit reached (${MAX_SCAN_FILES}).`); stopped = true; break; }

        if (size === null) {
          try {
            const t = await fs.readFile("utf8");
            size = typeof t === "string" ? t.length : 0;
          } catch (_) {
            size = 0;
          }
        }
        files.push({ path: rel, size, ...(secret ? { secret: true } : {}) });
      }
    }

    await walk(root, "", 0);
    files.sort((a, b) => a.path.localeCompare(b.path));
    previous.sort((a, b) => a.path.localeCompare(b.path));
    return { files, previous, warnings };
  }

  // ---------- File picker (checklist) ----------
  // Resolves to { count, exclusions } (unchecked items as { path, dir }),
  // "settings" if the Settings button was tapped, or null if cancelled.
  // Android's back button closes a custom screen the same way its Cancel button does.
  function backCancels(id, cancel) {
    try { acode.require("actionStack").push({ id, action: cancel }); } catch (e) { /* no back handling */ }
    return () => { try { acode.require("actionStack").remove(id); } catch (e) { /* ignore */ } };
  }

  function pickFiles(files, previous) {
    const items = [...files, ...previous.map((f) => ({ ...f, previous: true }))];
    return new Promise((resolve) => {
      const tokensOf = (f) => Math.ceil((f.size || 0) / 4);
      const newNode = (name) => ({ name, dirs: new Map(), files: [] });
      const rootNode = newNode("");

      for (const f of items) {
        const parts = f.path.split("/");
        let node = rootNode;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], newNode(parts[i]));
          node = node.dirs.get(parts[i]);
        }
        node.files.push(f);
      }

      const allIn = (node) => {
        const out = [...node.files];
        for (const d of node.dirs.values()) out.push(...allIn(d));
        return out;
      };

      // Repomix's own files, earlier bundles and likely secrets start unchecked.
      const isToolFile = (f) => /^(repomix\.config\.(json|json5|jsonc)|\.repomixignore)$/i.test(f.path);
      const dotsOff = cfg().dotfilesUnchecked;
      const selected = new Set(files.filter((f) => !f.secret && !isToolFile(f) && !(dotsOff && isDotted(f.path))).map((f) => f.path));
      const fileBoxes = [];
      const folderBoxes = [];
      const secretCount = files.filter((f) => f.secret).length;

      // Unchecked items: a fully unchecked folder is one entry.
      const exclusions = () => {
        const out = [];
        const walk = (node, prefix) => {
          const inside = allIn(node);
          if (prefix && inside.length && inside.every((f) => !selected.has(f.path))) {
            out.push({ path: prefix, dir: true });
            return;
          }
          for (const [name, dir] of node.dirs) walk(dir, prefix ? prefix + "/" + name : name);
          for (const f of node.files) if (!selected.has(f.path)) out.push({ path: f.path, dir: false });
        };
        walk(rootNode, "");
        return out;
      };

      const css = (e, text) => { e.style.cssText = text; return e; };
      const el = (tag, text) => {
        const e = document.createElement(tag);
        if (text !== undefined) e.textContent = text;
        return e;
      };

      const overlay = css(el("div"), [
        "position:fixed", "inset:0", "z-index:99999", "display:flex", "flex-direction:column",
        "background:var(--primary-color, #1e1e1e)", "color:var(--primary-text-color, #fff)", "font-size:15px"
      ].join(";"));

      const header = css(el("div"), "padding:12px 14px;font-weight:700;border-bottom:1px solid var(--border-color, rgba(128,128,128,.4))");
      header.textContent = "Select files to pack";
      const summary = css(el("div"), "font-weight:400;font-size:13px;opacity:.8;margin-top:4px");
      header.appendChild(summary);

      const list = css(el("div"), "flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch");
      const footer = css(el("div"), "display:flex;gap:6px;padding:10px;border-top:1px solid var(--border-color, rgba(128,128,128,.4))");

      const button = (label, onClick, primary) => {
        const b = css(el("button", label), [
          "flex:1", "min-height:44px", "padding:0 4px", "border:0", "border-radius:6px", "font-weight:700", "font-size:13px",
          primary ? "background:var(--accent-color, #168a45);color:#fff"
                  : "background:var(--secondary-color, #333);color:var(--primary-text-color, #fff)"
        ].join(";"));
        b.type = "button";
        b.addEventListener("click", onClick);
        return b;
      };

      const rowStyle = (depth) =>
        `display:flex;align-items:center;gap:8px;min-height:44px;padding:2px 12px 2px ${12 + depth * 18}px;border-bottom:1px solid rgba(128,128,128,.15)`;

      const makeBox = () => {
        const cb = el("input");
        cb.type = "checkbox";
        cb.style.cssText = "width:22px;height:22px;flex:none;accent-color:var(--accent-color, #168a45)";
        return cb;
      };

      function sync() {
        for (const { cb, file } of fileBoxes) cb.checked = selected.has(file.path);
        for (const { cb, node } of folderBoxes) {
          const inside = allIn(node);
          const n = inside.filter((f) => selected.has(f.path)).length;
          cb.checked = n > 0 && n === inside.length;
          cb.indeterminate = n > 0 && n < inside.length;
        }
        let tokens = 0;
        for (const f of items) if (selected.has(f.path)) tokens += tokensOf(f);
        summary.textContent =
          `${selected.size} of ${items.length} files · ~${Math.round(tokens / 100) / 10}k tokens · ` +
          `${exclusions().length} exclusions` +
          (previous.length ? ` · incl. ${previous.length} earlier bundle(s)` : "") +
          (secretCount ? ` · ${secretCount} possible secret(s)` : "");
      }

      function renderNode(node, depth, parentEl) {
        const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
        for (const dir of dirs) {
          const row = css(el("div"), rowStyle(depth) + ";font-weight:600");
          const cb = makeBox();
          const toggle = css(el("span", "▾"), "width:20px;text-align:center;flex:none;opacity:.8");
          const label = css(el("span", dir.name + "/"), "flex:1;overflow-wrap:anywhere");
          const count = css(el("span", String(allIn(dir).length)), "opacity:.6;font-size:12px;flex:none");
          row.append(cb, toggle, label, count);

          const children = el("div");
          cb.addEventListener("change", () => {
            for (const f of allIn(dir)) { if (cb.checked) selected.add(f.path); else selected.delete(f.path); }
            sync();
          });
          const flip = () => {
            const hidden = children.style.display === "none";
            children.style.display = hidden ? "" : "none";
            toggle.textContent = hidden ? "▾" : "▸";
          };
          toggle.addEventListener("click", flip);
          label.addEventListener("click", flip);

          folderBoxes.push({ cb, node: dir });
          parentEl.append(row, children);
          renderNode(dir, depth + 1, children);
        }

        for (const f of [...node.files].sort((a, b) => a.path.localeCompare(b.path))) {
          const row = css(el("label"), rowStyle(depth));
          const cb = makeBox();
          const spacer = css(el("span"), "width:20px;flex:none");
          const label = css(el("span", basename(f.path)), "flex:1;overflow-wrap:anywhere");
          const tag = f.previous ? "previous bundle · " : f.secret ? "possible secret · " : isToolFile(f) ? "Repomix file · " : "";
          const size = css(el("span", tag + `~${tokensOf(f)} tok`), "opacity:.6;font-size:12px;flex:none");
          row.append(cb, spacer, label, size);
          cb.addEventListener("change", () => {
            if (cb.checked) selected.add(f.path); else selected.delete(f.path);
            sync();
          });
          fileBoxes.push({ cb, file: f });
          parentEl.append(row);
        }
      }

      renderNode(rootNode, 0, list);

      let stopBack = () => {};
      const finish = (value) => {
        stopBack();
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(value);
      };
      stopBack = backCancels("arepomixgui-checklist", () => finish(null));

      footer.append(
        button("All", () => { items.forEach((f) => selected.add(f.path)); sync(); }),
        button("None", () => { selected.clear(); sync(); }),
        button("Settings", () => finish("settings")),
        button("Cancel", () => finish(null)),
        button("Run", () => finish({ count: selected.size, exclusions: exclusions() }), true)
      );

      overlay.append(header, list, footer);
      document.body.appendChild(overlay);
      sync();
    });
  }

  // ---------- .repomixignore handling ----------
  // Escape glob characters in a path for a Repomix --ignore pattern.
  const escapeGlob = (p) => String(p).replace(/[\[\]{}()*?!+@\\]/g, "\\$&").replace(/,/g, "?");

  // Escape a path for a .gitignore-style line.
  const gitignoreEscape = (p) =>
    String(p).replace(/[\\\[\]*?]/g, "\\$&").replace(/^([#!])/, "\\$1").replace(/ +$/, (m) => m.replace(/ /g, "\\ "));

  // Replace the plugin's block in .repomixignore text with `patterns` (an
  // empty list removes the block). Lines outside the block, and patterns
  // already present there, are left alone.
  function applyIgnoreBlock(text, patterns) {
    const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    const b = lines.findIndex((l) => l.trim() === IGNORE_BEGIN);
    if (b >= 0) {
      const e = lines.findIndex((l, i) => i > b && l.trim() === IGNORE_END);
      if (e >= 0) lines.splice(b, e - b + 1);
      else lines.splice(b, 1); // orphaned start marker: drop only the marker
    }
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    const existing = new Set(lines.map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
    const add = patterns.filter((p) => !existing.has(p));
    if (add.length) lines.push("", IGNORE_BEGIN, ...add, IGNORE_END);
    return lines.join("\n") + "\n";
  }

  // Ignores as a command-line flag (used when .repomixignore can't be used).
  function fallbackIgnoreFlags(items) {
    if (!items.length) return [];
    if (items.length > MAX_CLI_EXCLUSIONS) {
      throw new Error(
        `Too many exclusions for a command line (${items.length}; the limit is ` +
        `${MAX_CLI_EXCLUSIONS}). Uncheck whole folders, or let the plugin use a .repomixignore file.`
      );
    }
    const globs = items.map((i) => escapeGlob(i.path) + (i.dir ? "/**" : ""));
    toast("Using command-line ignores for this run");
    return ["--ignore " + shellQuote(globs.join(","))];
  }

  // Put the checklist's unchecked items into .repomixignore (inside the
  // plugin's block). Returns extra command flags, if any were needed.
  async function prepareIgnores(root, items, config) {
    const existing = await readTextFile(joinPath(root, IGNORE_NAME));
    const dotIgnoreOn = !(config && config.ignore && config.ignore.useDotIgnore === false);

    // Repomix is set to skip .repomixignore, so it can't carry the ignores.
    if (!dotIgnoreOn) return fallbackIgnoreFlags(items);

    const patterns = items.map((i) => "/" + gitignoreEscape(i.path) + (i.dir ? "/" : ""));

    if (existing === null) {
      if (!items.length) return [];
      const ok = await confirmDialog(
        "Create .repomixignore?",
        "Some files are unchecked. To leave them out, the plugin can add them to a " +
        ".repomixignore file in your project, which Repomix reads automatically. Create it? " +
        "If you cancel, the exclusions are sent on the command line instead (up to " + MAX_CLI_EXCLUSIONS + ")."
      );
      if (!ok) return fallbackIgnoreFlags(items);
      await writeTextFile(root, IGNORE_NAME, applyIgnoreBlock(IGNORE_TEMPLATE, patterns));
      return [];
    }

    const next = applyIgnoreBlock(existing, patterns);
    if (next !== existing) await writeTextFile(root, IGNORE_NAME, next);
    return [];
  }

  // ---------- Terminal ----------
  // Open an Alpine terminal tab and type commands into it, one at a time.
  async function openTerminal(name, command, preCommand = null, betweenCommand = null) {
    const terminal = acode.require("terminal");
    if (!terminal || typeof terminal.create !== "function") {
      throw new Error("This Acode version does not provide the terminal API.");
    }
    if (window.Terminal && typeof window.Terminal.isInstalled === "function") {
      if (!(await window.Terminal.isInstalled())) {
        throw new Error("The Alpine terminal is not installed yet. Open Acode's terminal once to set it up.");
      }
    }
    const term = await terminal.create({ name });
    const send = (text) => {
      try {
        terminal.write(term.id, text + "\r");
      } catch (error) {
        console.error(TAG, error);
        toast("Could not send the command to the terminal.");
      }
    };
    // Give the shell a moment to start, then send each command with a gap.
    const queue = [preCommand, betweenCommand, command].filter(Boolean);
    queue.forEach((text, i) => setTimeout(() => send(text), 1200 + i * 150));
  }

  const CHECK_COMMAND =
    'if command -v repomix >/dev/null 2>&1; then ' +
    'echo "Repomix is installed: $(repomix --version 2>&1 | tail -n 1)"; ' +
    'else echo "Repomix is NOT installed. Use Install or update Repomix in the ARepomixGUI settings."; fi';

  const INSTALL_COMMAND =
    'echo "Installing/updating Node.js and npm, then reinstalling the latest Repomix..."; ' +
    'apk add nodejs npm && npm install -g repomix@latest && ' +
    'echo "--- Install/reinstall finished. ---";';

  async function checkRepomix() {
    try {
      toast("Checking for Repomix…");
      await openTerminal("Repomix check", CHECK_COMMAND);
    } catch (error) {
      showError(error);
    }
  }

  async function installRepomix() {
    try {
      const ok = await confirmDialog(
        "Install Repomix?",
        "This will install/reinstall Node.js, npm and Repomix in Acode's Alpine terminal. " +
        "Press OK to start; a terminal tab will show the progress."
      );
      if (!ok) return;
      toast("Starting Repomix install…");
      await openTerminal("Repomix install", INSTALL_COMMAND);
    } catch (error) {
      showError(error);
    }
  }

  // Terminal folder for the project (or the override). Returns { root, folder }.
  function resolveFolder() {
    const c = cfg();
    if (c.terminalPathOverride) return { root: null, folder: c.terminalPathOverride };
    const root = getRootDirectory();
    const folder = toTerminalPath(root, c.terminalBase);
    if (!folder) {
      throw new Error(
        "Could not convert this folder to a terminal path:\n" + root +
        "\nSet 'Terminal path override' in the plugin settings."
      );
    }
    return { root, folder };
  }

  // ---------- Project files ----------
  async function ensureProjectFile(root, name, content, label) {
    if (await fileExists(joinPath(root, name))) return true;
    const ok = await confirmDialog("Create " + name + "?", "No " + name + " was found in this project folder. Create " + label + "?");
    if (!ok) return false;
    await writeTextFile(root, name, content);
    toast("Created " + name);
    return true;
  }

  const configText = () => JSON.stringify(CONFIG_TEMPLATE, null, 2) + "\n";

  async function createRepomixFiles() {
    try {
      const root = getRootDirectory();
      const cfgMissing = !(await fileExists(joinPath(root, REPOMIX_CONFIG_NAME)));
      const ignMissing = !(await fileExists(joinPath(root, IGNORE_NAME)));
      if (!cfgMissing && !ignMissing) { toast("Both Repomix files already exist."); return; }
      const names = [cfgMissing && REPOMIX_CONFIG_NAME, ignMissing && IGNORE_NAME].filter(Boolean).join(" and ");
      const ok = await confirmDialog(
        "Create Repomix files?",
        "This creates " + names + " in your project folder using Repomix's default contents. Existing files are never changed."
      );
      if (!ok) return;
      if (cfgMissing) await writeTextFile(root, REPOMIX_CONFIG_NAME, configText());
      if (ignMissing) await writeTextFile(root, IGNORE_NAME, IGNORE_TEMPLATE);
      toast("Created " + names);
    } catch (error) {
      showError(error);
    }
  }

  // Open a project file in an Acode tab using the `acode` command in Alpine.
  async function openProjectFile(name, content, label) {
    try {
      const { root, folder } = resolveFolder();
      if (!root) throw new Error("Raw editing needs the project folder; clear 'Terminal path override' first.");
      if (!(await ensureProjectFile(root, name, content, label))) return;
      await openTerminal("Open " + name, "acode " + shellQuote(name), 'echo "--- Opening ' + name + ' in Acode ---"', "cd " + shellQuote(folder));
    } catch (error) {
      showError(error);
    }
  }

  const editRepomixConfig = () => openProjectFile(REPOMIX_CONFIG_NAME, configText(), "one with Repomix's default settings");
  const editRepomixIgnore = () => openProjectFile(IGNORE_NAME, IGNORE_TEMPLATE, "an empty one");

  // Remove the plugin's block from the project's .repomixignore.
  // Returns false if there was no block to remove.
  async function removeIgnoreBlock(root) {
    const text = await readTextFile(joinPath(root, IGNORE_NAME));
    if (text === null || !text.includes(IGNORE_BEGIN)) return false;
    await writeTextFile(root, IGNORE_NAME, applyIgnoreBlock(text, []));
    return true;
  }

  async function clearPluginIgnores() {
    try {
      const root = getRootDirectory();
      const text = await readTextFile(joinPath(root, IGNORE_NAME));
      if (text === null || !text.includes(IGNORE_BEGIN)) {
        toast("No plugin ignores found in " + IGNORE_NAME);
        return;
      }
      const ok = await confirmDialog("Clear plugin ignores?", "This removes the block the plugin added to .repomixignore. Your own lines are not touched.");
      if (!ok) return;
      await removeIgnoreBlock(root);
      toast("Plugin ignores cleared");
    } catch (error) {
      showError(error);
    }
  }

  // ---------- Repomix options screen (edits repomix.config.json) ----------
  const OPTION_SECTIONS = [
    {
      title: "Output",
      fields: [
        { path: "output.fileSummary", type: "bool", label: "File summary", def: true },
        { path: "output.directoryStructure", type: "bool", label: "Directory structure", def: true },
        { path: "output.files", type: "bool", label: "Include file contents", def: true },
        { path: "output.removeComments", type: "bool", label: "Remove comments", def: false },
        { path: "output.removeEmptyLines", type: "bool", label: "Remove empty lines", def: false },
        { path: "output.compress", type: "bool", label: "Compress code",
          info: "Keep structure, shorten bodies.", def: false },
        { path: "output.showLineNumbers", type: "bool", label: "Show line numbers", def: false },
        { path: "output.parsableStyle", type: "bool", label: "Parsable output", def: false },
        { path: "output.truncateBase64", type: "bool", label: "Truncate base64 data", def: false },
        { path: "output.includeFullDirectoryStructure", type: "bool",
          label: "Full directory structure", def: false },
        { path: "output.tokenCountTree", type: "bool", label: "Token count tree", def: false },
        { path: "output.topFilesLength", type: "number", label: "Top files to list", def: 5 }
      ]
    },
    {
      title: "Ignore and security",
      fields: [
        { path: "ignore.useGitignore", type: "bool", label: "Use .gitignore", def: true },
        { path: "ignore.useDotIgnore", type: "bool", label: "Use .repomixignore / .ignore",
          info: "Must stay on for the checklist's exclusions to work.", def: true },
        { path: "ignore.useDefaultPatterns", type: "bool", label: "Use default ignore patterns", def: true },
        { path: "security.enableSecurityCheck", type: "bool", label: "Security check", def: true },
        { path: "input.maxFileSize", type: "kb", label: "Max file size (KB)", def: 52428800 }
      ]
    },
    {
      title: "Patterns",
      fields: [
        { path: "ignore.customPatterns", type: "list", label: "Custom ignore patterns",
          info: "One glob per entry, e.g. **/*.log", def: [] },
        { path: "include", type: "list", label: "Include only these patterns",
          info: "Leave empty to include everything.", def: [] }
      ]
    },
    {
      title: "Git (advanced)",
      fields: [
        { path: "output.git.sortByChanges", type: "bool", label: "Sort files by git changes", def: true },
        { path: "output.git.includeDiffs", type: "bool", label: "Include git diffs", def: false },
        { path: "output.git.includeLogs", type: "bool", label: "Include git logs", def: false }
      ]
    }
  ];

  function getPath(obj, path) {
    return path.split(".").reduce(
      (o, k) => (o && typeof o === "object" ? o[k] : undefined), obj
    );
  }

  function setPath(obj, path, value) {
    const keys = path.split(".");
    let node = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!node[keys[i]] || typeof node[keys[i]] !== "object") node[keys[i]] = {};
      node = node[keys[i]];
    }
    node[keys[keys.length - 1]] = value;
  }

  function deletePath(obj, path) {
    const keys = path.split(".");
    let node = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!node || typeof node !== "object") return;
      node = node[keys[i]];
    }
    if (node && typeof node === "object") delete node[keys[keys.length - 1]];
  }

  // Shows an options form (the config options by default). Resolves to the
  // updated object, or null if cancelled. `previewFn(values)` returns text for
  // a live preview line.
  function showOptionsScreen(config, sections = OPTION_SECTIONS, head = {}, previewFn = null) {
    return new Promise((resolve) => {
      const css = (e, text) => { e.style.cssText = text; return e; };
      const el = (tag, text) => {
        const e = document.createElement(tag);
        if (text !== undefined) e.textContent = text;
        return e;
      };
      const border = "border-bottom:1px solid rgba(128,128,128,.15)";
      const pick = (v, d) => (v === undefined ? d : v);

      const overlay = css(el("div"), [
        "position:fixed", "inset:0", "z-index:99999", "display:flex",
        "flex-direction:column", "background:var(--primary-color, #1e1e1e)",
        "color:var(--primary-text-color, #fff)", "font-size:15px"
      ].join(";"));

      const header = css(el("div", head.title || "Repomix options"), [
        "padding:12px 14px", "font-weight:700",
        "border-bottom:1px solid var(--border-color, rgba(128,128,128,.4))"
      ].join(";"));
      header.appendChild(css(
        el("div", head.sub || ("Saved to repomix.config.json. Output style and file name come " +
          "from the plugin settings.")),
        "font-weight:400;font-size:13px;opacity:.8;margin-top:4px"
      ));

      const body = css(el("div"), "flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch");
      const footer = css(el("div"), [
        "display:flex", "gap:8px", "padding:10px",
        "border-top:1px solid var(--border-color, rgba(128,128,128,.4))"
      ].join(";"));

      const button = (label, onClick, primary) => {
        const b = css(el("button", label), [
          "flex:1", "min-height:44px", "border:0", "border-radius:6px",
          "font-weight:700", "font-size:14px",
          primary
            ? "background:var(--accent-color, #168a45);color:#fff"
            : "background:var(--secondary-color, #333);color:var(--primary-text-color, #fff)"
        ].join(";"));
        b.type = "button";
        b.addEventListener("click", onClick);
        return b;
      };

      const inputStyle = [
        "width:100%", "box-sizing:border-box", "min-height:40px", "padding:6px 8px",
        "border-radius:6px", "border:1px solid rgba(128,128,128,.5)",
        "background:var(--secondary-color, #2a2a2a)",
        "color:var(--primary-text-color, #fff)", "font-size:15px"
      ].join(";");

      const entries = [];

      for (const section of sections) {
        const titleEl = css(el("div", section.title + (section.collapsed ? "  ▸" : "")), [
          "padding:14px 12px 6px", "font-weight:700", "font-size:13px",
          "text-transform:uppercase", "letter-spacing:.04em", "opacity:.7"
        ].join(";") + (section.collapsed ? ";cursor:pointer" : ""));
        body.appendChild(titleEl);
        // A collapsed section starts hidden; tapping its title shows it.
        let target = body;
        if (section.collapsed) {
          target = el("div");
          target.style.display = "none";
          body.appendChild(target);
          titleEl.addEventListener("click", () => {
            const hidden = target.style.display === "none";
            target.style.display = hidden ? "" : "none";
            titleEl.textContent = section.title + (hidden ? "  ▾" : "  ▸");
          });
        }

        for (const f of section.fields) {
          const raw = getPath(config, f.path);
          let initial;
          if (f.type === "bool") initial = !!pick(raw, f.def);
          else if (f.type === "kb") initial = String(Math.round(Number(pick(raw, f.def)) / 1024));
          else if (f.type === "list") initial = Array.isArray(raw) ? raw.map(String) : [];
          else initial = String(pick(raw, f.def));

          const entry = {
            field: f,
            initial: f.type === "list" ? initial.slice() : initial,
            current: f.type === "list" ? initial.slice() : initial
          };
          entries.push(entry);

          if (f.type === "bool") {
            const row = css(el("label"), [
              "display:flex", "align-items:center", "gap:10px", "min-height:48px",
              "padding:4px 12px", border
            ].join(";"));
            const cb = el("input");
            cb.type = "checkbox";
            cb.checked = initial;
            cb.style.cssText = "width:22px;height:22px;flex:none;accent-color:var(--accent-color, #168a45)";
            cb.addEventListener("change", () => { entry.current = cb.checked; });
            const col = el("div");
            col.appendChild(el("div", f.label));
            if (f.info) col.appendChild(css(el("div", f.info), "font-size:12px;opacity:.7"));
            row.append(cb, col);
            target.appendChild(row);
          } else if (f.type === "list") {
            const wrap = css(el("div"), "padding:8px 12px;" + border);
            wrap.appendChild(el("div", f.label));
            if (f.info) wrap.appendChild(css(el("div", f.info), "font-size:12px;opacity:.7;margin-bottom:6px"));
            const listEl = el("div");
            const render = () => {
              if (typeof listEl.replaceChildren === "function") listEl.replaceChildren();
              else listEl.innerHTML = "";
              entry.current.forEach((item, idx) => {
                const r = css(el("div"), "display:flex;align-items:center;gap:8px;min-height:40px");
                const t = css(el("span", item), "flex:1;overflow-wrap:anywhere;font-family:monospace;font-size:13px");
                const del = css(el("button", "✕"), [
                  "flex:none", "min-width:40px", "min-height:36px", "border:0", "border-radius:6px",
                  "background:var(--secondary-color, #333)", "color:var(--primary-text-color, #fff)"
                ].join(";"));
                del.type = "button";
                del.addEventListener("click", () => {
                  entry.current.splice(idx, 1);
                  render();
                });
                r.append(t, del);
                listEl.appendChild(r);
              });
            };
            const addRow = css(el("div"), "display:flex;gap:8px;margin-top:6px");
            const input = css(el("input"), inputStyle);
            input.type = "text";
            input.placeholder = "Add a pattern";
            const add = css(el("button", "Add"), [
              "flex:none", "min-width:64px", "min-height:40px", "border:0", "border-radius:6px",
              "font-weight:700", "background:var(--accent-color, #168a45)", "color:#fff"
            ].join(";"));
            add.type = "button";
            add.addEventListener("click", () => {
              const v = String(input.value || "").trim();
              if (v && !entry.current.includes(v)) entry.current.push(v);
              input.value = "";
              render();
            });
            addRow.append(input, add);
            wrap.append(listEl, addRow);
            target.appendChild(wrap);
            render();
          } else {
            const row = css(el("div"), "padding:8px 12px;" + border);
            row.appendChild(el("div", f.label + (f.type === "kb" ? " (KB)" : "")));
            if (f.info) row.appendChild(css(el("div", f.info), "font-size:12px;opacity:.7;margin-bottom:4px"));
            const input = css(el("input"), inputStyle);
            input.type = "text";
            if (f.type !== "text") input.inputMode = "numeric";
            input.value = initial;
            input.addEventListener("input", () => { entry.current = input.value; });
            row.appendChild(input);
            target.appendChild(row);
          }
        }
      }

      let stopBack = () => {};
      const finish = (value) => {
        stopBack();
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(value);
      };
      stopBack = backCancels("arepomixgui-options", () => finish(null));

      // The form's values merged into a copy of the config, or null if a
      // number is invalid (quiet = don't show a message).
      const collect = (quiet) => {
        const next = JSON.parse(JSON.stringify(config));
        for (const e of entries) {
          const f = e.field;
          let cur = e.current;
          if (JSON.stringify(cur) === JSON.stringify(e.initial)) continue;
          if (f.clearable && (f.type === "number" || f.type === "text") && !String(cur).trim()) {
            deletePath(next, f.path);
            continue;
          }
          if (f.type === "number" || f.type === "kb") {
            const n = Number(String(cur).trim());
            if (!String(cur).trim() || !Number.isFinite(n) || n < 0) {
              if (!quiet) toast(f.label + ": enter a number");
              return null;
            }
            cur = f.type === "kb" ? Math.round(n * 1024) : Math.round(n);
          } else if (f.type === "text") {
            cur = String(cur).trim();
            if (!cur) continue;
          }
          setPath(next, f.path, cur);
        }
        return next;
      };

      const save = () => {
        const next = collect(false);
        if (next) finish(next);
      };

      footer.append(button("Cancel", () => finish(null)), button("Save", save, true));

      // Optional live preview of what the form produces.
      let previewEl = null;
      if (previewFn) {
        previewEl = css(el("div"), "padding:8px 12px;font-family:monospace;font-size:12px;opacity:.85;overflow-wrap:anywhere;border-top:1px solid var(--border-color, rgba(128,128,128,.4))");
        const refresh = () => { previewEl.textContent = previewFn(collect(true) || config); };
        for (const t of ["input", "change", "click"]) body.addEventListener(t, () => setTimeout(refresh, 0));
        refresh();
      }
      overlay.append(header, body, ...(previewEl ? [previewEl] : []), footer);
      document.body.appendChild(overlay);
    });
  }

  async function openRepomixOptions() {
    try {
      const root = getRootDirectory();
      let text = await readTextFile(joinPath(root, REPOMIX_CONFIG_NAME));
      if (text === null) {
        const ok = await confirmDialog(
          "Create Repomix config?",
          "No " + REPOMIX_CONFIG_NAME + " was found in this project folder. " +
          "Create one with Repomix's default settings so you can edit it here?"
        );
        if (!ok) return;
        text = configText();
        await writeTextFile(root, REPOMIX_CONFIG_NAME, text);
      }
      const config = parseConfig(text);
      if (!config) {
        throw new Error(
          REPOMIX_CONFIG_NAME + " could not be read as plain JSON (it may " +
          "contain comments). Use 'Edit config file (raw)' to change it by hand."
        );
      }
      const saved = await showOptionsScreen(config);
      if (!saved) return;
      await writeTextFile(root, REPOMIX_CONFIG_NAME, JSON.stringify(saved, null, 2) + "\n");
      toast("Repomix options saved");
    } catch (error) {
      showError(error);
    }
  }

  // ---------- Command options (flags for one run) ----------
  // Saved in the plugin's settings. Each field's `path` is its key and `flag`
  // is the Repomix option it turns into.
  const COMMAND_SECTIONS = [
    {
      title: "Common",
      fields: [
        { path: "compress", type: "bool", label: "Compress code", flag: "--compress", def: false,
          info: "Keep structure (classes, functions), shorten bodies. The biggest token saver." },
        { path: "removeComments", type: "bool", label: "Remove comments", flag: "--remove-comments", def: false },
        { path: "removeEmptyLines", type: "bool", label: "Remove empty lines", flag: "--remove-empty-lines", def: false },
        { path: "noFileSummary", type: "bool", label: "Leave out the file summary", flag: "--no-file-summary", def: false },
        { path: "noDirectoryStructure", type: "bool", label: "Leave out the directory tree", flag: "--no-directory-structure", def: false },
        { path: "include", type: "text", label: "Include only these patterns", flag: "--include", def: "", clearable: true,
          info: "Comma-separated globs, e.g. src/**/*.js,*.md. Empty means everything." },
        { path: "tokenBudget", type: "number", label: "Token budget", flag: "--token-budget", def: "", clearable: true,
          info: "Fail if the output is bigger than this many tokens. Empty means no limit." }
      ]
    },
    {
      title: "Advanced",
      collapsed: true,
      fields: [
        { path: "showLineNumbers", type: "bool", label: "Show line numbers", flag: "--output-show-line-numbers", def: false },
        { path: "parsableStyle", type: "bool", label: "Parsable output", flag: "--parsable-style", def: false,
          info: "Escape special characters so the XML or Markdown stays valid." },
        { path: "truncateBase64", type: "bool", label: "Truncate base64 data", flag: "--truncate-base64", def: false },
        { path: "noFiles", type: "bool", label: "Metadata only (no file contents)", flag: "--no-files", def: false },
        { path: "includeEmptyDirectories", type: "bool", label: "Include empty folders", flag: "--include-empty-directories", def: false },
        { path: "includeFullDirectoryStructure", type: "bool", label: "Full directory tree", flag: "--include-full-directory-structure", def: false },
        { path: "includeDiffs", type: "bool", label: "Include git diffs", flag: "--include-diffs", def: false },
        { path: "includeLogs", type: "bool", label: "Include git logs", flag: "--include-logs", def: false },
        { path: "includeLogsCount", type: "number", label: "Number of logs", flag: "--include-logs-count", def: "", clearable: true },
        { path: "noGitSort", type: "bool", label: "Don't sort files by git changes", flag: "--no-git-sort-by-changes", def: false },
        { path: "headerText", type: "text", label: "Header text", flag: "--header-text", def: "", clearable: true,
          info: "Custom text placed at the start of the output." },
        { path: "instructionFilePath", type: "text", label: "Instruction file", flag: "--instruction-file-path", def: "", clearable: true,
          info: "Path to a file of instructions to include in the output." },
        { path: "splitOutput", type: "text", label: "Split output into files of", flag: "--split-output", def: "", clearable: true,
          info: "A size such as 500kb or 2mb." },
        { path: "topFilesLen", type: "number", label: "Largest files to list", flag: "--top-files-len", def: "", clearable: true },
        { path: "tokenCountEncoding", type: "text", label: "Token counting model", flag: "--token-count-encoding", def: "", clearable: true,
          info: "For example o200k_base or cl100k_base." },
        { path: "tokenCountTree", type: "bool", label: "Show token count tree", flag: "--token-count-tree", def: false },
        { path: "configPath", type: "text", label: "Config file path", flag: "-c", def: "", clearable: true,
          info: "Use this config instead of repomix.config.json." },
        { path: "noGitignore", type: "bool", label: "Ignore .gitignore rules", flag: "--no-gitignore", def: false },
        { path: "noDotIgnore", type: "bool", label: "Ignore .ignore / .repomixignore rules", flag: "--no-dot-ignore", def: false,
          info: "The checklist's exclusions are stored in .repomixignore, so turning this on stops them from working." },
        { path: "noDefaultPatterns", type: "bool", label: "Don't use built-in ignore patterns", flag: "--no-default-patterns", def: false },
        { path: "noSecurityCheck", type: "bool", label: "Skip the security check", flag: "--no-security-check", def: false },
        { path: "watch", type: "bool", label: "Watch for changes", flag: "--watch", def: false,
          info: "Keeps the terminal running and re-packs when files change. The output isn't opened automatically." },
        { path: "remoteBranch", type: "text", label: "Remote branch or tag", flag: "--remote-branch", def: "", clearable: true, remoteOnly: true,
          info: "Used only by Pack a remote repository." }
      ]
    }
  ];

  // The flags for the saved options, as separate strings.
  function buildCommandFlags(opts, { remote = false } = {}) {
    const out = [];
    for (const section of COMMAND_SECTIONS) {
      for (const f of section.fields) {
        if (f.remoteOnly && !remote) continue;
        const v = opts && opts[f.path];
        if (f.type === "bool") {
          if (v === true) out.push(f.flag);
        } else if (v !== undefined && v !== null && String(v).trim() !== "") {
          out.push(f.flag + " " + (f.type === "number" ? String(Number(v)) : shellQuote(String(v).trim())));
        }
      }
    }
    return out;
  }

  function commandPreview(opts) {
    const c = cfg();
    return [c.repomixCommand, "[style and output from settings]", ...buildCommandFlags(opts), c.repomixFlags,
      "[+ checklist exclusions]"].filter(Boolean).join(" ");
  }

  async function openCommandOptions() {
    try {
      const c = cfg();
      const saved = await showOptionsScreen(c.options, COMMAND_SECTIONS, {
        title: "Command options",
        sub: "Flags added to every run. Saved in this plugin's settings, not in your project. A flag here overrides the same option in repomix.config.json."
      }, commandPreview);
      if (!saved) return;
      c.options = saved;
      appSettings.update();
      toast("Command options saved");
    } catch (error) {
      showError(error);
    }
  }

  // ---------- Settings page ----------
  function pluginSettingsPage() {
    try { return acode.require("settings").uiSettings["plugin-" + PLUGIN_ID]; } catch (_) { return null; }
  }

  function openSettingsPage() {
    const page = pluginSettingsPage();
    if (page && typeof page.show === "function") page.show();
    else toast("Open Settings, Plugins, then the gear next to ARepomixGUI.");
  }

  // "Run Repomix now": close the settings page, then start.
  function runFromSettings() {
    const page = pluginSettingsPage();
    if (page && typeof page.hide === "function") page.hide();
    setTimeout(runPlugin, 250);
  }

  // ---------- Run ----------
  async function runRepomix() {
    const c = cfg();
    const { root, folder } = resolveFolder();

    let config = null;
    if (root) {
      const text = await readTextFile(joinPath(root, REPOMIX_CONFIG_NAME));
      config = text ? parseConfig(text) : null;
    }
    const out = resolveOutput(config);

    // Optional checklist: unchecked items become ignore patterns.
    let items = [];
    if (c.showPicker) {
      if (root) {
        toast("Scanning project…");
        const useGit = !(config && config.ignore && config.ignore.useGitignore === false);
        const gitText = useGit ? await readTextFile(joinPath(root, ".gitignore")) : null;
        const outBase = stripExt(basename(out.name)).toLowerCase();
        const scan = await scanProject(root, gitText ? parseGitignore(gitText) : [], outBase);
        if (scan.files.length) {
          const picked = await pickFiles(scan.files, scan.previous);
          if (picked === "settings") { openSettingsPage(); return; }
          if (!picked) { toast("Cancelled"); return; }
          if (!picked.count) throw new Error("No files were selected.");
          items = picked.exclusions;
        }
      } else {
        toast("Checklist skipped (a terminal path override is set).");
      }
    }

    // Write the exclusions into .repomixignore (or fall back to --ignore).
    const extraFlags = root ? await prepareIgnores(root, items, config) : [];

    const flags = [
      out.style ? "--style " + out.style : "",
      out.passOutput ? "--output " + shellQuote(out.name) : "",
      ...extraFlags,
      ...buildCommandFlags(c.options),
      c.repomixFlags
    ].filter(Boolean).join(" ");

    let command = `${c.repomixCommand} ${flags}`.trim();
    if (c.openOutput && !c.options.watch) command += ` && acode ${shellQuote(out.name)}`;
    const status = `echo "--- Running Repomix in ${folder.replace(/["$`\\]/g, "")} ---"`;

    toast("Starting Repomix in " + folder);
    await openTerminal("Repomix", command, status, `cd ${shellQuote(folder)}`);
  }

  // Pack a remote repository (--remote). The result goes in the project
  // folder when one is open.
  async function packRemote() {
    if (running) return;
    running = true;
    try {
      const c = cfg();
      const target = String(await acode.require("prompt")("Repository to pack (user/repo or a URL)", "", "text") || "").trim();
      if (!target) return;
      let folder = "";
      try { folder = resolveFolder().folder; } catch (_) {}
      const out = resolveOutput(null);
      const flags = [
        out.style ? "--style " + out.style : "",
        "--output " + shellQuote(out.name),
        "--remote " + shellQuote(target),
        ...buildCommandFlags(c.options, { remote: true }),
        c.repomixFlags
      ].filter(Boolean).join(" ");
      let command = `${c.repomixCommand} ${flags}`.trim();
      if (c.openOutput && folder && !c.options.watch) command += ` && acode ${shellQuote(out.name)}`;
      toast("Packing " + target);
      await openTerminal("Repomix remote", command, 'echo "--- Packing ' + target.replace(/["$`\\]/g, "") + ' ---"', folder ? `cd ${shellQuote(folder)}` : null);
    } catch (error) {
      showError(error);
    } finally {
      running = false;
    }
  }

  async function runPlugin() {
    if (running) return;
    running = true;
    try {
      await runRepomix();
    } catch (error) {
      showError(error);
    } finally {
      running = false;
    }
  }

  // ---------- UI ----------
  function applySideButton() {
    try {
      if (sideButton && typeof sideButton.hide === "function") sideButton.hide();
      sideButton = null;
      if (!cfg().showSideButton) return;
      const SideButton = acode.require("sideButton");
      if (typeof SideButton === "function") {
        sideButton = SideButton({ text: "Repomix", icon: "icon-copy", onclick: runPlugin });
        if (sideButton && typeof sideButton.show === "function") sideButton.show();
      }
    } catch (error) {
      console.warn(TAG, "Side button API unavailable:", error);
    }
  }

  function init() {
    cfg();
    try {
      acode.require("commands").addCommand({
        name: "arepomixgui.run",
        description: "ARepomixGUI: Run Repomix",
        exec: () => { runPlugin(); return true; }
      });
    } catch (error) {
      console.warn(TAG, "Command registration unavailable:", error);
    }
    applySideButton();
    console.log(TAG, "Initialized.");
  }

  function destroy() {
    // Uninstall cleanup: drop our block from the current project's .repomixignore.
    try {
      removeIgnoreBlock(getRootDirectory()).catch(() => {});
    } catch (_) {}
    try {
      const commands = acode.require("commands");
      if (commands && typeof commands.removeCommand === "function") commands.removeCommand("arepomixgui.run");
    } catch (_) {}
    if (sideButton && typeof sideButton.hide === "function") sideButton.hide();
    sideButton = null;
  }

  if (window.acode) {
    cfg();
    // `list` is a getter so values are fresh each time the page opens.
    const settings = {
      get list() { return settingsObject().list; },
      cb: (key, value) => settingsObject().cb(key, value)
    };
    acode.setPluginInit(PLUGIN_ID, async () => init(), settings);
    acode.setPluginUnmount(PLUGIN_ID, () => destroy());
  }
})();
