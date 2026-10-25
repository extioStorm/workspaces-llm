(() => {
  "use strict";

  // Bundle Workspace: lightweight and good enough. It packs a project's
  // text files into one document for an LLM. Not an edge-case-proof tool;
  // for heavier needs see the ARepomixGUI plugin (a GUI for Repomix).

  const PLUGIN_ID = "com.custom.bundleworkspace";
  const TAG = "[Bundle Workspace]";

  const SKIP_DIRS = new Set([
    ".git", ".hg", ".svn", "node_modules", "vendor", "dist", "build",
    "coverage", ".idea", ".vscode", ".gradle", "__pycache__", ".next",
    ".cache"
  ]);

  // Obvious binaries, skipped by name without being opened. Anything else is
  // read, and a content check drops files that turn out to be binary.
  const BINARY_EXTENSIONS = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".tif", ".tiff",
    ".heic", ".avif", ".psd", ".pdf", ".zip", ".gz", ".tgz", ".tar", ".7z",
    ".rar", ".bz2", ".xz", ".jar", ".war", ".apk", ".aab", ".ipa", ".exe",
    ".dll", ".so", ".dylib", ".a", ".o", ".obj", ".class", ".pyc", ".wasm",
    ".bin", ".dat", ".db", ".sqlite", ".mp3", ".wav", ".ogg", ".flac", ".m4a",
    ".aac", ".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".ttf", ".otf",
    ".woff", ".woff2", ".eot", ".iso", ".dmg"
  ]);

  const SKIP_FILES = new Set([
    ".env", ".env.local", ".env.production", ".env.development",
    ".npmrc", ".pypirc", "id_rsa", "id_ed25519", "credentials.json",
    "secrets.json"
  ]);

  const MAX_DEPTH = 30;
  const FORMATS = ["xml", "markdown", "plain"];
  const EXT = { xml: ".xml", markdown: ".md", plain: ".txt" };
  const BLANK_MODES = ["keep as is", "collapse 3+ to 1", "collapse 2+ to 1", "remove all"];

  // ---------- Settings ----------
  const DEFAULTS = {
    outputName: "bundled-workspace",
    outputFormat: "xml",
    blankLines: "collapse 3+ to 1",
    showPicker: true,
    includeTree: true,
    respectGitignore: true,
    useProjectRoot: true,
    rootLevelsUp: 0,
    showSideButton: true,
    maxFiles: 500,
    maxFileKB: 512,
    maxTotalChars: 4000000,
    extraSkipDirs: "",
    dotfilesUnchecked: true,
    saveCopy: false
  };

  const appSettings = acode.require("settings");

  const baseName = (v) =>
    String(v || "").trim().replace(/\.(xml|md|txt|json)$/i, "") || DEFAULTS.outputName;

  function cfg() {
    let c = appSettings.value[PLUGIN_ID];
    if (!c) {
      c = appSettings.value[PLUGIN_ID] = { ...DEFAULTS };
      appSettings.update(false);
      return c;
    }
    for (const k of Object.keys(DEFAULTS)) if (c[k] === undefined) c[k] = DEFAULTS[k];
    return c;
  }

  const num = (v, fallback, min) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= min ? n : fallback;
  };

  const csvSet = (text, transform) =>
    new Set(String(text || "").split(",").map((s) => transform(s.trim())).filter(Boolean));

  const outputFileName = () => baseName(cfg().outputName) + EXT[cfg().outputFormat];

  // [key, label, info, type, extra]
  const ITEMS = [
    ["outputName", "Output file name", "Name without extension. The extension follows Output format (for example bundled-workspace.xml).", "text"],
    ["outputFormat", "Output format", "xml, markdown or plain.", "select", FORMATS],
    ["blankLines", "Blank lines", "keep as is, collapse 3+ to 1, collapse 2+ to 1, or remove all. Works on every line break in a file, including inside strings, so remove all can change string contents.", "select", BLANK_MODES],
    ["showPicker", "Choose files before bundling", "Show a checklist so you can uncheck files or folders to leave out.", "bool"],
    ["includeTree", "Include directory tree", "Add a file tree at the top of the bundle.", "bool"],
    ["respectGitignore", "Respect .gitignore", "Apply the project's top-level .gitignore (basic patterns).", "bool"],
    ["dotfilesUnchecked", "Start dotfiles unchecked", "Files and folders whose names start with a dot (like .eslintrc or .github/) are listed but start unchecked. Possible secrets such as .env and key files always start unchecked.", "bool"],
    ["saveCopy", "Save the bundle in the project folder", "Write the bundle into the folder that was packaged, named from Output file name (a file with that name is replaced), and open that file in a tab. If it can't be saved, an unsaved tab opens instead.", "bool"],
    ["useProjectRoot", "Use open project folder as root", "Prefer the folder opened in Acode's sidebar that contains the active file.", "bool"],
    ["rootLevelsUp", "Fallback root (levels up)", "Used when no opened folder matches: 0 = the active file's folder, 1 = its parent, and so on (max 10).", "number"],
    ["showSideButton", "Show side button", "Show the floating button on the screen edge.", "bool"],
    ["maxFiles", "Max files", "Stop after this many files.", "number"],
    ["maxFileKB", "Max file size (KB)", "Skip files larger than this.", "number"],
    ["maxTotalChars", "Max total characters", "Stop when the bundle reaches this size.", "number"],
    ["extraSkipDirs", "Extra folders to skip", "Comma-separated folder names, e.g. assets,tmp.", "text"]
  ];

  function settingsObject() {
    const c = cfg();
    const list = ITEMS.map(([key, text, info, type, extra]) => {
      const item = { key, text, info };
      if (type === "bool") item.checkbox = !!c[key];
      else if (type === "select") { item.value = c[key]; item.select = extra; }
      else {
        item.value = type === "text" && key !== "outputName" ? (c[key] || "(none)") : c[key];
        item.prompt = text;
        item.promptType = type;
      }
      return item;
    });
    list.push({ key: "runNow", text: "Bundle workspace now", info: "Run the bundler (open a project file first)." });

    return {
      list,
      cb: (key, value) => {
        if (key === "runNow") return runFromSettings();
        const row = ITEMS.find((i) => i[0] === key);
        if (!row) return;
        const c2 = cfg();
        const type = row[3];
        if (type === "bool") c2[key] = !!value;
        else if (type === "select") c2[key] = row[4].includes(value) ? value : DEFAULTS[key];
        else if (type === "number") c2[key] = key === "rootLevelsUp"
          ? Math.min(num(value, 0, 0), 10)
          : num(value, DEFAULTS[key], key === "maxTotalChars" ? 1000 : 1);
        else if (key === "outputName") c2[key] = baseName(value);
        else c2[key] = value === "(none)" ? "" : String(value || "");
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
  const isSecret = (n) => SKIP_FILES.has(n.toLowerCase()) || /\.(pem|key|p12|pfx|keystore|jks)$/i.test(n);
  const isBinaryName = (n) => BINARY_EXTENSIONS.has(extensionOf(n.toLowerCase()));
  const isDotted = (path) => path.split("/").some((part) => part.startsWith("."));
  // Whether a file starts checked (and is bundled when there is no checklist).
  const startsSelected = (f) => !f.secret && !(cfg().dotfilesUnchecked && isDotted(f.path));

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
    if (!active || !active.location) throw new Error("Open a file inside the workspace before bundling.");
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

  // ---------- .gitignore (basic patterns) ----------
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

  async function loadGitignore(root) {
    try {
      const text = await acode.require("fsOperation")(joinPath(root, ".gitignore")).readFile("utf8");
      return typeof text === "string" ? parseGitignore(text) : [];
    } catch (_) {
      return [];
    }
  }

  // ---------- Scanning ----------
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

  function looksBinary(text) {
    if (text.includes("\u0000")) return true;
    const sample = text.slice(0, 8192);
    let bad = 0;
    for (let i = 0; i < sample.length; i++) {
      const c = sample.charCodeAt(i);
      if ((c < 32 && ![8, 9, 10, 12, 13].includes(c)) || (c >= 0x7f && c <= 0x9f)) bad++;
    }
    return sample.length > 0 && bad / sample.length > 0.02;
  }

  const statSize = (st) =>
    st && typeof st.size === "number" ? st.size : st && typeof st.length === "number" ? st.length : null;

  function tidyBlankLines(text, mode) {
    if (mode === "keep as is") return text;
    text = text.replace(/\r\n/g, "\n");
    if (mode === "collapse 3+ to 1") return text.replace(/\n{3,}/g, "\n\n");
    if (mode === "collapse 2+ to 1") return text.replace(/\n{2,}/g, "\n");
    return text.split("\n").filter((l) => l.trim() !== "").join("\n");
  }

  async function collectWorkspace(root, limits) {
    const files = [];
    const previous = [];
    const warnings = [];
    const visited = new Set();
    let totalChars = 0;
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
      if (!Array.isArray(entries)) { warnings.push(`Unexpected directory listing: ${relative || "."}`); return; }

      for (const entry of entries) {
        if (stopped) return;
        const name = entryName(entry);
        if (!name || name === "." || name === ".." || name.toLowerCase() === ".ds_store") continue;

        const fullPath = entryPath(normalized, entry);
        const rel = relative ? `${relative}/${name}` : name;
        let fs;
        try { fs = acode.require("fsOperation")(fullPath); } catch (_) { warnings.push(`Cannot access ${rel}`); continue; }

        const dir = await isDirectory(fs, entry);
        if (limits.gitignore.length && isIgnored(limits.gitignore, rel, name, dir)) continue;

        if (dir) {
          const lower = name.toLowerCase();
          if (!SKIP_DIRS.has(lower) && !limits.skipDirs.has(lower)) await walk(fullPath, rel, depth + 1);
          continue;
        }

        if (isBinaryName(name)) continue;

        // Earlier bundles are listed separately (unchecked in the checklist).
        if (/^repomix-output/i.test(name) || name.toLowerCase().startsWith(limits.outputBase + ".")) {
          let size = 0;
          try { size = statSize(await fs.stat()) || 0; } catch (_) {}
          previous.push({ path: rel, fullPath, size });
          continue;
        }

        if (files.length >= limits.maxFiles) { warnings.push(`File limit reached (${limits.maxFiles}).`); stopped = true; break; }

        try {
          const known = statSize(await fs.stat());
          if (known !== null && known > limits.maxFileBytes) { warnings.push(`Skipped oversized file: ${rel}`); continue; }
          let content = await fs.readFile("utf8");
          if (typeof content !== "string" || looksBinary(content)) { warnings.push(`Skipped binary or non-text file: ${rel}`); continue; }
          content = tidyBlankLines(content, limits.blankMode);
          if (totalChars + content.length > limits.maxTotalChars) { warnings.push("Total bundle size limit reached."); stopped = true; break; }
          files.push({ path: rel, content, ...(isSecret(name) ? { secret: true } : {}) });
          totalChars += content.length;
        } catch (error) {
          warnings.push(`Cannot read ${rel}: ${error.message || error}`);
        }
      }
    }

    await walk(root, "", 0);
    files.sort((a, b) => a.path.localeCompare(b.path));
    previous.sort((a, b) => a.path.localeCompare(b.path));
    return { files, previous, warnings };
  }

  async function buildLimits(c, root) {
    return {
      maxFiles: num(c.maxFiles, DEFAULTS.maxFiles, 1),
      maxFileBytes: num(c.maxFileKB, DEFAULTS.maxFileKB, 1) * 1024,
      maxTotalChars: num(c.maxTotalChars, DEFAULTS.maxTotalChars, 1000),
      skipDirs: csvSet(c.extraSkipDirs, (s) => s.toLowerCase()),
      gitignore: c.respectGitignore ? await loadGitignore(root) : [],
      blankMode: BLANK_MODES.includes(c.blankLines) ? c.blankLines : DEFAULTS.blankLines,
      outputBase: baseName(c.outputName).toLowerCase()
    };
  }

  // ---------- Output formats ----------
  function buildTree(paths) {
    const top = {};
    for (const p of paths) {
      let node = top;
      for (const part of p.split("/")) node = node[part] = node[part] || {};
    }
    const lines = [];
    (function render(node, prefix) {
      const names = Object.keys(node).sort((a, b) => {
        const ad = Object.keys(node[a]).length > 0;
        const bd = Object.keys(node[b]).length > 0;
        return ad === bd ? a.localeCompare(b) : ad ? -1 : 1;
      });
      names.forEach((n, i) => {
        const last = i === names.length - 1;
        const isDir = Object.keys(node[n]).length > 0;
        lines.push(prefix + (last ? "└── " : "├── ") + n + (isDir ? "/" : ""));
        if (isDir) render(node[n], prefix + (last ? "    " : "│   "));
      });
    })(top, "");
    return lines.join("\n");
  }

  const fenceFor = (text) => {
    const longest = (String(text).match(/`+/g) || []).reduce((m, r) => Math.max(m, r.length), 0);
    return "`".repeat(Math.max(3, longest + 1));
  };

  const escapeAttr = (v) =>
    String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function treeBlock(result) {
    if (!cfg().includeTree) return "";
    const tree = buildTree(result.files.map((f) => f.path));
    const fence = fenceFor(tree);
    return "## Directory Tree\n\n" + fence + "text\n" + tree + "\n" + fence;
  }

  const NOTE = "> Review this bundle before sharing. It may contain proprietary code.";

  function buildBundleMarkdown(root, result) {
    const out = ["# Workspace Bundle", "", `- Root: \`${root}\``, `- Files included: ${result.files.length}`, "", NOTE, ""];
    const tree = treeBlock(result);
    if (tree) out.push(tree, "");
    for (const f of result.files) {
      const fence = fenceFor(f.content);
      out.push(`## ${f.path}`, "", fence + extensionOf(basename(f.path)).slice(1), f.content.replace(/\n+$/, ""), fence, "");
    }
    if (result.warnings.length) {
      out.push("## Collection warnings", "");
      for (const w of result.warnings) out.push("- " + w);
      out.push("");
    }
    return out.join("\n");
  }

  function buildBundlePlain(root, result) {
    const bar = "=".repeat(48);
    const out = ["Workspace Bundle", "Root: " + root, "Files included: " + result.files.length, "", NOTE.replace("> ", ""), ""];
    if (cfg().includeTree) out.push("Directory Tree", bar, buildTree(result.files.map((f) => f.path)), "");
    for (const f of result.files) out.push(bar, "FILE: " + f.path, bar, f.content.replace(/\n+$/, ""), "");
    if (result.warnings.length) {
      out.push(bar, "WARNINGS", bar);
      for (const w of result.warnings) out.push("- " + w);
      out.push("");
    }
    return out.join("\n");
  }

  function buildBundleXml(root, result) {
    const tree = treeBlock(result);
    const out = [
      "# Workspace Bundle", "", `- Root: \`${root}\``, `- Files included: ${result.files.length}`,
      "- Structure: XML file boundaries with CDATA content", "", NOTE, "",
      ...(tree ? [tree, ""] : []), "<workspace>", ""
    ];
    for (const f of result.files) {
      out.push(`<file path="${escapeAttr(f.path)}">`, "<![CDATA[", f.content.replace(/\]\]>/g, "]]]]><![CDATA[>"), "]]>", "</file>", "");
    }
    out.push("</workspace>", "");
    if (result.warnings.length) {
      out.push("<!-- Collection warnings:");
      for (const w of result.warnings) out.push(" - " + w.replace(/--/g, "—"));
      out.push("-->", "");
    }
    return out.join("\n");
  }

  function buildBundle(root, result) {
    const f = cfg().outputFormat;
    if (f === "markdown") return buildBundleMarkdown(root, result);
    if (f === "plain") return buildBundlePlain(root, result);
    return buildBundleXml(root, result);
  }

  // ---------- File picker (checklist) ----------
  // Resolves to the list of chosen paths, "settings" if the Settings button
  // was tapped, or null if cancelled.
  function pickFiles(files, previous) {
    // Earlier bundles are ordinary rows that start unchecked.
    const items = [...files, ...previous.map((f) => ({ ...f, previous: true, content: "" }))];
    return new Promise((resolve) => {
      const tokensOf = (f) => Math.ceil((f.size != null ? f.size : f.content.length) / 4);
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

      const secretCount = files.filter((f) => f.secret).length;
      const selected = new Set(files.filter(startsSelected).map((f) => f.path));
      const fileBoxes = [];
      const folderBoxes = [];

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
      header.textContent = "Select files to bundle";
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
          `${selected.size} of ${items.length} files · ~${Math.round(tokens / 100) / 10}k tokens` +
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
          const size = css(el("span", (f.previous ? "previous bundle · " : f.secret ? "possible secret · " : "") + `~${tokensOf(f)} tok`), "opacity:.6;font-size:12px;flex:none");
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

      const finish = (value) => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(value);
      };

      footer.append(
        button("All", () => { items.forEach((f) => selected.add(f.path)); sync(); }),
        button("None", () => { selected.clear(); sync(); }),
        button("Settings", () => finish("settings")),
        button("Cancel", () => finish(null)),
        button("Bundle", () => finish(items.map((f) => f.path).filter((p) => selected.has(p))), true)
      );

      overlay.append(header, list, footer);
      document.body.appendChild(overlay);
      sync();
    });
  }

  // Write the bundle into the packaged folder (replacing a file of that name).
  async function writeCopy(root, name, text) {
    const fsOp = acode.require("fsOperation");
    const uri = joinPath(root, name);
    if (await fsOp(uri).exists()) await fsOp(uri).writeFile(text);
    else await fsOp(root).createFile(name, text);
  }

  // ---------- Settings page ----------
  function pluginSettingsPage() {
    try { return acode.require("settings").uiSettings["plugin-" + PLUGIN_ID]; } catch (_) { return null; }
  }

  function openSettingsPage() {
    const page = pluginSettingsPage();
    if (page && typeof page.show === "function") page.show();
    else toast("Open Settings, Plugins, then the gear next to Bundle Workspace.");
  }

  // "Bundle workspace now": close the settings page, then start.
  function runFromSettings() {
    const page = pluginSettingsPage();
    if (page && typeof page.hide === "function") page.hide();
    setTimeout(bundleWorkspace, 250);
  }

  // ---------- Run ----------
  async function bundleWorkspace() {
    if (running) return;
    running = true;
    toast("Bundling workspace…");

    try {
      const c = cfg();
      const root = getRootDirectory();
      const result = await collectWorkspace(root, await buildLimits(c, root));

      if (!result.files.length) throw new Error("No eligible text files found. Open a project file and try again.");

      if (c.showPicker) {
        const chosen = await pickFiles(result.files, result.previous);
        if (chosen === "settings") { openSettingsPage(); return; }
        if (!chosen) { toast("Bundling cancelled"); return; }
        if (!chosen.length) throw new Error("No files were selected.");
        const keep = new Set(chosen);
        result.files = result.files.filter((f) => keep.has(f.path));
        // Earlier bundles the user ticked: read them now.
        for (const p of result.previous) {
          if (!keep.has(p.path)) continue;
          try {
            const text = await acode.require("fsOperation")(p.fullPath).readFile("utf8");
            if (typeof text === "string") result.files.push({ path: p.path, content: text });
          } catch (error) {
            result.warnings.push(`Cannot read ${p.path}: ${error.message || error}`);
          }
        }
        result.files.sort((a, b) => a.path.localeCompare(b.path));
      } else {
        result.files = result.files.filter(startsSelected);
        if (!result.files.length) throw new Error("No files to bundle.");
      }

      const output = buildBundle(root, result);
      if (typeof acode.newEditorFile !== "function") throw new Error("This Acode version does not expose newEditorFile().");
      const name = outputFileName();
      let saved = "";
      let opened = false;
      if (c.saveCopy) {
        try {
          await writeCopy(root, name, output);
          saved = ` · saved ${name}`;
          // The tab is the saved file, so closing it doesn't ask about saving.
          acode.newEditorFile(name, { uri: joinPath(root, name), text: output, render: true, editable: true, isUnsaved: false });
          opened = true;
        } catch (error) {
          result.warnings.push(`Could not save the bundle: ${error.message || error}`);
        }
      }
      if (!opened) acode.newEditorFile(name, { text: output, render: true, editable: true, isUnsaved: true });

      if (result.warnings.length) console.warn(result.warnings);
      toast(
        `Bundled ${result.files.length} files, ~${Math.round(output.length / 4000)}k tokens` + saved +
        (result.warnings.length ? `, ${result.warnings.length} warnings` : "")
      );
    } catch (error) {
      console.error(TAG, error);
      if (typeof acode.alert === "function") acode.alert("Bundle Workspace", error.message || String(error));
      else toast(error.message || String(error));
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
        sideButton = SideButton({ text: "Bundle Workspace", icon: "icon-copy", onclick: bundleWorkspace });
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
        name: "bundle-workspace.run",
        description: "Bundle Workspace",
        exec: () => { bundleWorkspace(); return true; }
      });
    } catch (error) {
      console.warn(TAG, "Command registration unavailable:", error);
    }
    applySideButton();
    console.log(TAG, "Initialized.");
  }

  function destroy() {
    try {
      const commands = acode.require("commands");
      if (commands && typeof commands.removeCommand === "function") commands.removeCommand("bundle-workspace.run");
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
