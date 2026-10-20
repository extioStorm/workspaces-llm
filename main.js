(() => {
  "use strict";

  const PLUGIN_ID = "com.custom.bundleworkspace";

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

  const SKIP_FILES = new Set([
    ".env", ".env.local", ".env.production", ".env.development",
    ".npmrc", ".pypirc", "id_rsa", "id_ed25519", "credentials.json",
    "secrets.json"
  ]);

  const MAX_DEPTH = 30;

  // ---------- Settings ----------
  const DEFAULTS = {
    showSideButton: true,
    outputName: "BUNDLE_WORKSPACE.md",
    useProjectRoot: true,
    rootLevelsUp: 0,
    outputFormat: "xml",
    includeTree: true,
    collapseBlankLines: true,
    respectGitignore: true,
    showPicker: true,
    engine: "builtin",
    repomixCommand: "repomix",
    repomixFlags: "",
    repomixCompress: false,
    repomixRemoveComments: false,
    terminalBase: "/storage/emulated/0",
    terminalPathOverride: "",
    maxFiles: 500,
    maxFileKB: 512,
    maxTotalChars: 4000000,
    extraSkipDirs: "",
    extraExtensions: ""
  };

  const appSettings = acode.require("settings");

  function ensureSettings() {
    if (!appSettings.value[PLUGIN_ID]) {
      appSettings.value[PLUGIN_ID] = { ...DEFAULTS };
      appSettings.update(false);
    } else {
      for (const k of Object.keys(DEFAULTS)) {
        if (appSettings.value[PLUGIN_ID][k] === undefined) {
          appSettings.value[PLUGIN_ID][k] = DEFAULTS[k];
        }
      }
      // v1.5: the output style now comes from the Output format setting.
      if (appSettings.value[PLUGIN_ID].repomixFlags === "--style xml") {
        appSettings.value[PLUGIN_ID].repomixFlags = "";
      }
    }
    return appSettings.value[PLUGIN_ID];
  }

  function cfg() {
    return ensureSettings();
  }

  function num(value, fallback, min) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n >= min ? n : fallback;
  }

  function csvSet(text, transform) {
    return new Set(
      String(text || "").split(",").map((s) => transform(s.trim())).filter(Boolean)
    );
  }

  function settingsObject() {
    const c = cfg();
    return {
      list: [
        {
          key: "showSideButton",
          text: "Show side button",
          info: "Show the floating button on the screen edge.",
          checkbox: !!c.showSideButton
        },
        {
          key: "outputName",
          text: "Output file name",
          info: "Name of the generated bundle file.",
          value: c.outputName,
          prompt: "Output file name",
          promptType: "text"
        },
        {
          key: "engine",
          text: "Bundler engine",
          info: "builtin = this plugin's bundler. repomix = open an Alpine " +
            "terminal tab and run Repomix in the project folder.",
          value: c.engine,
          select: ["builtin", "repomix"]
        },
        {
          key: "repomixCommand",
          text: "Repomix command",
          info: "Command used in the terminal, e.g. repomix or npx repomix.",
          value: c.repomixCommand,
          prompt: "Repomix command",
          promptType: "text"
        },
        {
          key: "repomixFlags",
          text: "Repomix flags",
          info: "Extra flags added after the checkbox options, " +
            "e.g. --include \"src/**\"",
          value: c.repomixFlags || "(none)",
          prompt: "Repomix flags",
          promptType: "text"
        },
        {
          key: "terminalBase",
          text: "Terminal path for main storage",
          info: "What 'primary' storage is called inside Alpine.",
          value: c.terminalBase,
          prompt: "Base path",
          promptType: "text"
        },
        {
          key: "terminalPathOverride",
          text: "Terminal path override",
          info: "If set, always run Repomix in this exact terminal folder " +
            "instead of the detected project folder.",
          value: c.terminalPathOverride || "(none)",
          prompt: "Absolute terminal path",
          promptType: "text"
        },
        {
          key: "repomixCompress",
          text: "Repomix: compress code",
          info: "Repomix mode only. Adds --compress to keep code structure " +
            "but shorten bodies.",
          checkbox: !!c.repomixCompress
        },
        {
          key: "repomixRemoveComments",
          text: "Repomix: remove comments",
          info: "Repomix mode only. Adds --remove-comments.",
          checkbox: !!c.repomixRemoveComments
        },
        {
          key: "checkRepomix",
          text: "Check Repomix",
          info: "Opens a terminal tab and reports whether Repomix is installed."
        },
        {
          key: "installRepomix",
          text: "Install Repomix",
          info: "Installs Node.js, npm and Repomix in Acode's Alpine " +
            "terminal. Asks before doing anything."
        },
        {
          key: "showPicker",
          text: "Choose files before bundling",
          info: "Built-in engine only. After scanning, show a checklist so " +
            "you can uncheck files or whole folders to leave out.",
          checkbox: !!c.showPicker
        },
        {
          key: "useProjectRoot",
          text: "Use open project folder as root",
          info: "Bundle from the folder opened in Acode's sidebar that " +
            "contains the active file. Falls back to the setting below.",
          checkbox: !!c.useProjectRoot
        },
        {
          key: "outputFormat",
          text: "Output format",
          info: "xml = <file> tags. markdown = fenced code blocks. " +
            "Used by both engines.",
          value: c.outputFormat,
          select: ["xml", "markdown"]
        },
        {
          key: "includeTree",
          text: "Include directory tree",
          info: "Add a file tree at the top of the bundle. " +
            "Used by both engines.",
          checkbox: !!c.includeTree
        },
        {
          key: "collapseBlankLines",
          text: "Collapse extra blank lines",
          info: "Saves tokens. Built-in: shrinks 3+ blank lines to one. " +
            "Repomix: removes empty lines (--remove-empty-lines).",
          checkbox: !!c.collapseBlankLines
        },
        {
          key: "respectGitignore",
          text: "Respect .gitignore",
          info: "Apply the project's .gitignore rules. Used by both engines.",
          checkbox: !!c.respectGitignore
        },
        {
          key: "rootLevelsUp",
          text: "Fallback root: folders above active file",
          info: "0 = folder of the active file. 1 = its parent, etc. " +
            "Used when no open project folder matches.",
          value: c.rootLevelsUp,
          prompt: "Levels up (0-10)",
          promptType: "number"
        },
        {
          key: "maxFiles",
          text: "Max files",
          value: c.maxFiles,
          prompt: "Maximum number of files",
          promptType: "number"
        },
        {
          key: "maxFileKB",
          text: "Max file size (KB)",
          value: c.maxFileKB,
          prompt: "Skip files larger than (KB)",
          promptType: "number"
        },
        {
          key: "maxTotalChars",
          text: "Max total characters",
          value: c.maxTotalChars,
          prompt: "Maximum characters in bundle",
          promptType: "number"
        },
        {
          key: "extraSkipDirs",
          text: "Extra folders to skip",
          info: "Comma-separated folder names, e.g. assets,tmp. " +
            "Used by both engines.",
          value: c.extraSkipDirs || "(none)",
          prompt: "Comma-separated folder names",
          promptType: "text"
        },
        {
          key: "extraExtensions",
          text: "Extra file extensions",
          info: "Comma-separated, e.g. .vue,.lua,.log",
          value: c.extraExtensions || "(none)",
          prompt: "Comma-separated extensions",
          promptType: "text"
        },
        {
          key: "runNow",
          text: "Bundle workspace now",
          info: "Run the bundler (open a project file first)."
        }
      ],
      cb: (key, value) => {
        if (key === "runNow") {
          bundleWorkspace();
          return;
        }
        if (key === "checkRepomix") {
          checkRepomix();
          return;
        }
        if (key === "installRepomix") {
          installRepomix();
          return;
        }
        const c2 = cfg();
        switch (key) {
          case "showSideButton":
            c2.showSideButton = !!value;
            break;
          case "engine":
            c2.engine = value === "repomix" ? "repomix" : "builtin";
            break;
          case "repomixCommand":
            c2.repomixCommand = String(value || "").trim() || DEFAULTS.repomixCommand;
            break;
          case "repomixFlags":
            c2.repomixFlags = value === "(none)" ? "" : String(value || "").trim();
            break;
          case "terminalBase":
            c2.terminalBase =
              String(value || "").trim().replace(/\/+$/, "") || DEFAULTS.terminalBase;
            break;
          case "terminalPathOverride":
            c2.terminalPathOverride =
              value === "(none)" ? "" : String(value || "").trim();
            break;
          case "showPicker":
          case "useProjectRoot":
          case "includeTree":
          case "collapseBlankLines":
          case "respectGitignore":
          case "repomixCompress":
          case "repomixRemoveComments":
            c2[key] = !!value;
            break;
          case "outputFormat":
            c2.outputFormat = value === "markdown" ? "markdown" : "xml";
            break;
          case "outputName":
            c2.outputName = String(value || "").trim() || DEFAULTS.outputName;
            break;
          case "rootLevelsUp":
            c2.rootLevelsUp = Math.min(num(value, 0, 0), 10);
            break;
          case "maxFiles":
            c2.maxFiles = num(value, DEFAULTS.maxFiles, 1);
            break;
          case "maxFileKB":
            c2.maxFileKB = num(value, DEFAULTS.maxFileKB, 1);
            break;
          case "maxTotalChars":
            c2.maxTotalChars = num(value, DEFAULTS.maxTotalChars, 1000);
            break;
          case "extraSkipDirs":
            c2.extraSkipDirs = value === "(none)" ? "" : String(value || "");
            break;
          case "extraExtensions":
            c2.extraExtensions = value === "(none)" ? "" : String(value || "");
            break;
          default:
            return;
        }
        appSettings.update();
        if (key === "showSideButton") applySideButton();
      }
    };
  }

  // ---------- State / helpers ----------
  let sideButton = null;

  function toast(message) {
    if (typeof window.toast === "function") window.toast(message, 3000);
    else console.log("[Bundle Workspace]", message);
  }

  function setStatus(message) {
    console.log("[Bundle Workspace]", message);
  }

  function normalizePath(path) {
    return String(path || "").replace(/\\/g, "/");
  }

  function joinPath(parent, child) {
    return normalizePath(parent).replace(/\/+$/, "") +
      "/" + String(child || "").replace(/^\/+/, "");
  }

  function basename(path) {
    return normalizePath(path).split("/").filter(Boolean).pop() || "";
  }

  function extensionOf(name) {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(dot).toLowerCase() : "";
  }

  function isHidden(name) {
    return name.startsWith(".");
  }

  function shouldSkipFile(name) {
    if (SKIP_FILES.has(name.toLowerCase())) return true;
    return /\.(pem|key|p12|pfx|keystore|jks)$/i.test(name);
  }

  function isTextCandidate(name, extraExts) {
    const lower = name.toLowerCase();
    if (shouldSkipFile(name)) return false;
    const ext = extensionOf(lower);
    return TEXT_EXTENSIONS.has(ext) || extraExts.has(ext) || TEXT_NAMES.has(lower);
  }

  // Folders opened in Acode's sidebar; the exact export differs by version.
  function openFolders() {
    try {
      if (Array.isArray(window.addedFolder) && window.addedFolder.length) {
        return window.addedFolder;
      }
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
      const inside = [location, fileUri].some(
        (p) => p && (p === url || p.startsWith(url + "/"))
      );
      if (inside && url.length > best.length) best = url;
    }
    return best;
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
      try {
        rules.push({ negate, dirOnly, anchored, re: new RegExp("^" + source + "$") });
      } catch (_) {}
    }
    return rules;
  }

  function isIgnored(rules, relPath, name, isDir) {
    let ignored = false;
    for (const rule of rules) {
      if (rule.dirOnly && !isDir) continue;
      if (rule.re.test(rule.anchored ? relPath : name)) ignored = !rule.negate;
    }
    return ignored;
  }

  async function loadGitignore(root) {
    try {
      const text = await acode.require("fsOperation")(
        joinPath(root, ".gitignore")
      ).readFile("utf8");
      return typeof text === "string" ? parseGitignore(text) : [];
    } catch (_) {
      return [];
    }
  }

  // ---------- Tree / formats ----------
  function buildTree(paths) {
    const rootNode = {};
    for (const p of paths) {
      let node = rootNode;
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
    })(rootNode, "");
    return lines.join("\n");
  }

  function fenceFor(text) {
    const runs = String(text).match(/`+/g) || [];
    const longest = runs.reduce((m, r) => Math.max(m, r.length), 0);
    return "`".repeat(Math.max(3, longest + 1));
  }

  function treeBlock(result) {
    if (!cfg().includeTree) return "";
    const tree = buildTree(result.files.map((f) => f.path));
    const fence = fenceFor(tree);
    return "## Directory Tree\n\n" + fence + "text\n" + tree + "\n" + fence;
  }

  function buildBundleMarkdown(root, result) {
    const out = [
      "# Workspace Bundle", "",
      `- Root: \`${root}\``,
      `- Files included: ${result.files.length}`,
      "",
      "> Review this bundle before sharing. It may contain proprietary code.",
      ""
    ];
    const tree = treeBlock(result);
    if (tree) out.push(tree, "");

    for (const file of result.files) {
      const fence = fenceFor(file.content);
      const lang = extensionOf(basename(file.path)).slice(1);
      out.push(
        `## ${file.path}`, "",
        fence + lang,
        file.content.replace(/\n+$/, ""),
        fence, ""
      );
    }

    if (result.warnings.length) {
      out.push("## Collection warnings", "");
      for (const w of result.warnings) out.push("- " + w);
      out.push("");
    }
    return out.join("\n");
  }

  // Convert an Acode folder address into a path usable in the Alpine terminal.
  //   content://com.android.externalstorage.documents/tree/primary%3AProjects::primary:Projects/app
  //   -> /storage/emulated/0/Projects/app
  function toTerminalPath(uri, base) {
    let u = String(uri || "");
    const basePath = String(base || "/storage/emulated/0").replace(/\/+$/, "");
    const volumePath = (vol) =>
      vol === "primary" || vol === "" ? basePath : "/storage/" + vol;
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

  function getRootDirectory() {
    const manager = window.editorManager;
    const activeFile = manager && manager.activeFile;
    if (!activeFile || !activeFile.location) {
      throw new Error("Open a file inside the workspace before bundling.");
    }
    let dir = normalizePath(activeFile.location);
    dir = dir.replace(/\/+$/, "");

    if (cfg().useProjectRoot) {
      const project = findProjectRoot(dir, normalizePath(activeFile.uri || ""));
      if (project) return project;
    }

    const levels = 1 + num(cfg().rootLevelsUp, 0, 0);
    for (let i = 0; i < levels; i++) {
      const idx = dir.lastIndexOf("/");
      if (idx <= 0) break;
      const next = dir.substring(0, idx);
      // Don't climb past a URI scheme like content://
      if (/^[a-z][a-z0-9+.-]*:\/*$/i.test(next)) break;
      dir = next;
    }
    return dir || "/";
  }

  function entryName(entry) {
    if (typeof entry === "string") return basename(entry);
    return entry && (
      entry.name || entry.filename ||
      basename(entry.uri || entry.url || entry.path || "")
    ) || "";
  }

  function entryPath(parent, entry) {
    if (typeof entry === "string") {
      return entry.includes("/") ? normalizePath(entry) : joinPath(parent, entry);
    }
    const candidate = entry && (entry.uri || entry.url || entry.path);
    if (typeof candidate === "string" && candidate) return normalizePath(candidate);
    return joinPath(parent, entryName(entry));
  }

  function explicitDirectory(entry) {
    if (!entry || typeof entry === "string") return false;
    if (typeof entry.isDirectory === "boolean") return entry.isDirectory;
    if (typeof entry.isDir === "boolean") return entry.isDir;
    if (typeof entry.type === "string") {
      return /^(directory|dir|folder)$/i.test(entry.type);
    }
    return false;
  }

  async function isDirectory(fs, entry) {
    if (explicitDirectory(entry)) return true;
    try {
      const stat = await fs.stat();
      if (stat && typeof stat.isDirectory === "boolean") return stat.isDirectory;
      if (stat && typeof stat.isDir === "boolean") return stat.isDir;
      if (stat && typeof stat.type === "string") {
        return /^(directory|dir|folder)$/i.test(stat.type);
      }
    } catch (e) {
      console.warn("[Bundle Workspace] stat failed:", e);
    }
    return false;
  }

  function looksBinary(text) {
    if (text.includes("\u0000")) return true;
    const sample = text.slice(0, 8192);
    let suspicious = 0;
    for (let i = 0; i < sample.length; i++) {
      const c = sample.charCodeAt(i);
      if ((c < 32 && ![8, 9, 10, 12, 13].includes(c)) ||
          (c >= 0x7f && c <= 0x9f)) suspicious++;
    }
    return sample.length > 0 && suspicious / sample.length > 0.02;
  }

  function escapeXmlAttribute(value) {
    return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
      if (depth > MAX_DEPTH) {
        warnings.push(`Maximum directory depth reached: ${relative || "."}`);
        return;
      }

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

      if (!Array.isArray(entries)) {
        warnings.push(`Unexpected directory listing: ${relative || "."}`);
        return;
      }

      for (const entry of entries) {
        if (stopped) return;
        const name = entryName(entry);
        if (!name || name === "." || name === ".." || isHidden(name)) continue;

        const fullPath = entryPath(normalized, entry);
        const relativePath = relative ? `${relative}/${name}` : name;
        let fs;

        try {
          fs = acode.require("fsOperation")(fullPath);
        } catch (error) {
          warnings.push(`Cannot access ${relativePath}`);
          continue;
        }

        const dir = await isDirectory(fs, entry);

        if (limits.gitignore.length &&
            isIgnored(limits.gitignore, relativePath, name, dir)) continue;

        if (dir) {
          const lower = name.toLowerCase();
          if (!SKIP_DIRS.has(lower) && !limits.skipDirs.has(lower)) {
            await walk(fullPath, relativePath, depth + 1);
          }
          continue;
        }

        if (!isTextCandidate(name, limits.extraExts)) continue;

        // Never re-bundle previously generated bundles; list them so the
        // picker can show them (unchecked and locked).
        if (/^(bundle_workspace|repomix-output)/i.test(name) ||
            name.toLowerCase() === limits.outputName) {
          previous.push({ path: relativePath });
          continue;
        }

        if (files.length >= limits.maxFiles) {
          warnings.push(`File limit reached (${limits.maxFiles}).`);
          stopped = true;
          break;
        }

        try {
          const stat = await fs.stat();
          if (stat && typeof stat.size === "number" && stat.size > limits.maxFileBytes) {
            warnings.push(`Skipped oversized file: ${relativePath}`);
            continue;
          }

          let content = await fs.readFile("utf8");
          if (typeof content === "string" && limits.collapseBlank) {
            content = content.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
          }
          if (typeof content !== "string" || looksBinary(content)) {
            warnings.push(`Skipped binary or non-text file: ${relativePath}`);
            continue;
          }

          if (totalChars + content.length > limits.maxTotalChars) {
            warnings.push("Total bundle size limit reached.");
            stopped = true;
            break;
          }

          files.push({ path: relativePath, content });
          totalChars += content.length;
          if (files.length % 10 === 0) {
            setStatus(`Scanning… ${files.length} files`);
          }
        } catch (error) {
          warnings.push(`Cannot read ${relativePath}: ${error.message || error}`);
        }
      }
    }

    await walk(root, "", 0);
    files.sort((a, b) => a.path.localeCompare(b.path));
    previous.sort((a, b) => a.path.localeCompare(b.path));
    return { files, previous, warnings, totalChars };
  }

  function buildBundle(root, result) {
    return cfg().outputFormat === "markdown"
      ? buildBundleMarkdown(root, result)
      : buildBundleXml(root, result);
  }

  function buildBundleXml(root, result) {
    const tree = treeBlock(result);
    const out = [
      "# Workspace Bundle", "",
      `- Root: \`${root}\``,
      `- Files included: ${result.files.length}`,
      "- Structure: XML file boundaries with CDATA content",
      "",
      "> Review this bundle before sharing. It may contain proprietary code.",
      "",
      ...(tree ? [tree, ""] : []),
      "<workspace>", ""
    ];

    for (const file of result.files) {
      const body = file.content.replace(/\]\]>/g, "]]]]><![CDATA[>");
      out.push(
        `<file path="${escapeXmlAttribute(file.path)}">`,
        "<![CDATA[",
        body,
        "]]>",
        "</file>",
        ""
      );
    }

    out.push("</workspace>", "");
    if (result.warnings.length) {
      out.push("<!-- Collection warnings:");
      for (const warning of result.warnings) {
        out.push(" - " + warning.replace(/--/g, "—"));
      }
      out.push("-->", "");
    }
    return out.join("\n");
  }

  // ---------- Terminal helpers ----------
  function shellQuote(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
  }

  // Build Repomix flags from the settings shared with the built-in engine.
  function repomixFlagList(c) {
    const f = ["--style " + (c.outputFormat === "markdown" ? "markdown" : "xml")];
    if (!c.includeTree) f.push("--no-directory-structure");
    if (c.collapseBlankLines) f.push("--remove-empty-lines");
    if (!c.respectGitignore) f.push("--no-gitignore");
    if (c.repomixCompress) f.push("--compress");
    if (c.repomixRemoveComments) f.push("--remove-comments");
    const globs = [...csvSet(c.extraSkipDirs, (s) => s.replace(/^\/+|\/+$/g, ""))]
      .map((d) => "**/" + d + "/**");
    if (globs.length) f.push("--ignore " + shellQuote(globs.join(",")));
    if (c.repomixFlags) f.push(c.repomixFlags);
    return f;
  }

  async function confirmDialog(title, message) {
    try {
      if (typeof acode.confirm === "function") {
        return !!(await acode.confirm(title, message));
      }
    } catch (_) {}
    return window.confirm(title + "\n\n" + message);
  }

  function showError(error) {
    console.error("[Bundle Workspace]", error);
    if (typeof acode.alert === "function") {
      acode.alert("Bundle Workspace", error.message || String(error));
    } else {
      toast(error.message || String(error));
    }
  }

  // Open an Alpine terminal tab and type a command into it.
  async function openTerminal(name, command) {
    const terminal = acode.require("terminal");
    if (!terminal || typeof terminal.create !== "function") {
      throw new Error("This Acode version does not provide the terminal API.");
    }
    if (window.Terminal && typeof window.Terminal.isInstalled === "function") {
      const installed = await window.Terminal.isInstalled();
      if (!installed) {
        throw new Error(
          "The Alpine terminal is not installed yet. Open Acode's terminal once to set it up."
        );
      }
    }
    const term = await terminal.create({ name });
    // Give the shell a moment to start before sending the command.
    setTimeout(() => {
      try {
        terminal.write(term.id, command + "\r");
      } catch (error) {
        console.error("[Bundle Workspace]", error);
        toast("Could not send the command to the terminal.");
      }
    }, 1200);
  }

  const CHECK_COMMAND =
    'if command -v repomix >/dev/null 2>&1; then ' +
    'echo "Repomix is installed: $(repomix --version 2>&1 | tail -n 1)"; ' +
    'else echo "Repomix is NOT installed. Use Install Repomix in the Bundle Workspace plugin settings."; fi';

  const INSTALL_COMMAND =
    'echo "Installing/updating Node.js and npm, then reinstalling the latest Repomix..."; ' +
    'apk add nodejs npm && npm install -g repomix@latest && ' +
    'echo "--- Install/reinstall finished. Set Bundler engine to repomix in the plugin settings. ---";';

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
        "This will install/reinstall Node.js, npm and Repomix in Acode's Alpine " +
        "terminal. Press OK to start; a terminal tab will show the progress."
      );
      if (!ok) return;
      toast("Starting Repomix install…");
      await openTerminal("Repomix install", INSTALL_COMMAND);
    } catch (error) {
      showError(error);
    }
  }

  // ---------- Repomix via Alpine terminal ----------
  async function runRepomix() {
    try {
      const c = cfg();
      let folder = c.terminalPathOverride;
      if (!folder) {
        const root = getRootDirectory();
        folder = toTerminalPath(root, c.terminalBase);
        if (!folder) {
          throw new Error(
            "Could not convert this folder to a terminal path:\n" + root +
            "\nSet 'Terminal path override' in the plugin settings."
          );
        }
      }

      const flags = repomixFlagList(c).join(" ");
      const command =
        `cd ${shellQuote(folder)} && ${c.repomixCommand} ${flags}` +
        ` && echo "--- Repomix finished in ${folder.replace(/["$`\\]/g, "")} ---"`;

      toast("Starting Repomix in " + folder);
      await openTerminal("Repomix", command);
    } catch (error) {
      console.error("[Bundle Workspace]", error);
      if (typeof acode.alert === "function") {
        acode.alert("Bundle Workspace", error.message || String(error));
      } else {
        toast(error.message || String(error));
      }
    }
  }

  // ---------- File picker (checklist) ----------
  // Resolves to an array of selected paths, or null if cancelled.
  function pickFiles(files, previous) {
    previous = previous || [];
    return new Promise((resolve) => {
      const approxTokens = (f) => Math.ceil(f.content.length / 4);
      const newNode = (name) => ({ name, dirs: new Map(), files: [], prev: [] });
      const rootNode = newNode("");

      for (const f of files) {
        const parts = f.path.split("/");
        let node = rootNode;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], newNode(parts[i]));
          node = node.dirs.get(parts[i]);
        }
        node.files.push(f);
      }

      for (const f of previous) {
        const parts = f.path.split("/");
        let node = rootNode;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], newNode(parts[i]));
          node = node.dirs.get(parts[i]);
        }
        node.prev.push(f);
      }

      const allIn = (node) => {
        const out = [...node.files];
        for (const d of node.dirs.values()) out.push(...allIn(d));
        return out;
      };

      const selected = new Set(files.map((f) => f.path));
      const fileBoxes = [];
      const folderBoxes = [];

      const css = (el, text) => { el.style.cssText = text; return el; };
      const el = (tag, text) => {
        const e = document.createElement(tag);
        if (text !== undefined) e.textContent = text;
        return e;
      };

      const overlay = css(el("div"), [
        "position:fixed", "inset:0", "z-index:99999", "display:flex",
        "flex-direction:column",
        "background:var(--primary-color, #1e1e1e)",
        "color:var(--primary-text-color, #fff)", "font-size:15px"
      ].join(";"));

      const header = css(el("div"), [
        "padding:12px 14px", "font-weight:700",
        "border-bottom:1px solid var(--border-color, rgba(128,128,128,.4))"
      ].join(";"));
      header.textContent = "Select files to bundle";
      const summary = css(el("div"), "font-weight:400;font-size:13px;opacity:.8;margin-top:4px");
      header.appendChild(summary);

      const list = css(el("div"), "flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch");

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

      const rowStyle = (depth) => [
        "display:flex", "align-items:center", "gap:8px", "min-height:44px",
        `padding:2px 12px 2px ${12 + depth * 18}px`,
        "border-bottom:1px solid rgba(128,128,128,.15)"
      ].join(";");

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
        for (const f of files) if (selected.has(f.path)) tokens += approxTokens(f);
        summary.textContent =
          `${selected.size} of ${files.length} files · ~${Math.round(tokens / 100) / 10}k tokens` +
          (previous.length ? ` · ${previous.length} previous bundle(s) skipped` : "");
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
            for (const f of allIn(dir)) {
              if (cb.checked) selected.add(f.path); else selected.delete(f.path);
            }
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

        const sorted = [...node.files].sort((a, b) => a.path.localeCompare(b.path));
        for (const f of sorted) {
          const row = css(el("label"), rowStyle(depth));
          const cb = makeBox();
          const spacer = css(el("span"), "width:20px;flex:none");
          const label = css(el("span", basename(f.path)), "flex:1;overflow-wrap:anywhere");
          const size = css(
            el("span", `~${approxTokens(f)} tok`),
            "opacity:.6;font-size:12px;flex:none"
          );
          row.append(cb, spacer, label, size);
          cb.addEventListener("change", () => {
            if (cb.checked) selected.add(f.path); else selected.delete(f.path);
            sync();
          });
          fileBoxes.push({ cb, file: f });
          parentEl.append(row);
        }

        // Earlier bundles: shown for clarity, unchecked and locked.
        for (const f of [...node.prev].sort((a, b) => a.path.localeCompare(b.path))) {
          const row = css(el("div"), rowStyle(depth) + ";opacity:.55");
          const cb = makeBox();
          cb.disabled = true;
          cb.checked = false;
          const spacer = css(el("span"), "width:20px;flex:none");
          const label = css(el("span", basename(f.path)), "flex:1;overflow-wrap:anywhere");
          const note = css(el("span", "previous bundle"), "font-size:12px;flex:none");
          row.append(cb, spacer, label, note);
          parentEl.append(row);
        }
      }

      renderNode(rootNode, 0, list);

      const finish = (value) => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(value);
      };

      footer.append(
        button("All", () => { files.forEach((f) => selected.add(f.path)); sync(); }),
        button("None", () => { selected.clear(); sync(); }),
        button("Cancel", () => finish(null)),
        button("Bundle", () => finish(files.map((f) => f.path).filter((p) => selected.has(p))), true)
      );

      overlay.append(header, list, footer);
      document.body.appendChild(overlay);
      sync();
    });
  }

  let running = false;

  async function bundleWorkspace() {
    if (running) return;
    if (cfg().engine === "repomix") return runRepomix();
    running = true;
    toast("Bundling workspace…");

    try {
      const c = cfg();
      const limits = {
        maxFiles: num(c.maxFiles, DEFAULTS.maxFiles, 1),
        maxFileBytes: num(c.maxFileKB, DEFAULTS.maxFileKB, 1) * 1024,
        maxTotalChars: num(c.maxTotalChars, DEFAULTS.maxTotalChars, 1000),
        skipDirs: csvSet(c.extraSkipDirs, (s) => s.toLowerCase()),
        extraExts: csvSet(c.extraExtensions, (s) => {
          if (!s) return "";
          return (s.startsWith(".") ? s : "." + s).toLowerCase();
        })
      };

      const root = getRootDirectory();
      limits.gitignore = c.respectGitignore ? await loadGitignore(root) : [];
      limits.collapseBlank = !!c.collapseBlankLines;
      limits.outputName = String(c.outputName || "").toLowerCase();
      const result = await collectWorkspace(root, limits);

      if (!result.files.length) {
        throw new Error(
          "No eligible text files found. Open a project file and try again."
        );
      }

      if (c.showPicker) {
        const chosen = await pickFiles(result.files, result.previous);
        if (!chosen) {
          toast("Bundling cancelled");
          return;
        }
        if (!chosen.length) throw new Error("No files were selected.");
        const keep = new Set(chosen);
        result.files = result.files.filter((f) => keep.has(f.path));
      }

      const output = buildBundle(root, result);

      if (typeof acode.newEditorFile !== "function") {
        throw new Error("This Acode version does not expose newEditorFile().");
      }

      acode.newEditorFile(c.outputName || DEFAULTS.outputName, {
        text: output,
        render: true,
        editable: true,
        isUnsaved: true
      });

      if (result.warnings.length) console.warn(result.warnings);
      toast(
        `Bundled ${result.files.length} files, ~${Math.round(output.length / 4000)}k tokens` +
        (result.warnings.length ? `, ${result.warnings.length} warnings` : "")
      );
    } catch (error) {
      console.error("[Bundle Workspace]", error);
      if (typeof acode.alert === "function") {
        acode.alert("Bundle Workspace", error.message || String(error));
      } else {
        toast(error.message || String(error));
      }
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
        sideButton = SideButton({
          text: "Bundle Workspace",
          icon: "icon-copy",
          onclick: bundleWorkspace
        });
        if (sideButton && typeof sideButton.show === "function") sideButton.show();
      }
    } catch (error) {
      console.warn("[Bundle Workspace] Side button API unavailable:", error);
    }
  }

  function init() {
    ensureSettings();

    try {
      const commands = acode.require("commands");
      commands.addCommand({
        name: "bundle-workspace.run",
        description: "Bundle Workspace",
        exec: () => {
          bundleWorkspace();
          return true;
        }
      });
    } catch (error) {
      console.warn("[Bundle Workspace] Command registration unavailable:", error);
    }

    applySideButton();
    console.log("[Bundle Workspace] Initialized.");
  }

  function destroy() {
    try {
      const commands = acode.require("commands");
      if (commands && typeof commands.removeCommand === "function") {
        commands.removeCommand("bundle-workspace.run");
      }
    } catch (_) {}

    if (sideButton && typeof sideButton.hide === "function") sideButton.hide();
    sideButton = null;
  }

  if (window.acode) {
    ensureSettings();
    // Third argument gives the plugin its settings page (gear icon on the
    // plugin's entry in Settings > Plugins). `list` is a getter so values
    // are fresh each time the page opens.
    const settings = {
      get list() { return settingsObject().list; },
      cb: (key, value) => settingsObject().cb(key, value)
    };
    acode.setPluginInit(PLUGIN_ID, async () => init(), settings);
    acode.setPluginUnmount(PLUGIN_ID, () => destroy());
  }
})();
