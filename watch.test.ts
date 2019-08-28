import * as fs from "fs";
import { join as joinPath } from "path";
import * as path from "path";
import * as ts from "typescript";
import * as glob from "glob";

const performance = (ts as any).performance;

function reportTimeStatistic() {
  const programTime = performance.getDuration("Program");
  const bindTime = performance.getDuration("Bind");
  const checkTime = performance.getDuration("Check");
  const emitTime = performance.getDuration("Emit");
  const lines = [];
  // Individual component times.
  // Note: To match the behavior of previous versions of the compiler, the reported parse time includes
  // I/O read time and processing time for triple-slash references and module imports, and the reported
  // emit time includes I/O write time. We preserve this behavior so we can accurately compare times.
  lines.push(`I/O read ${performance.getDuration("I/O Read")}`);
  lines.push(`I/O write ${performance.getDuration("I/O Write")}`);
  lines.push(`Parse time ${programTime}`);
  lines.push(`Bind time ${bindTime}`);
  lines.push(`Check time ${checkTime}`);
  lines.push(`Emit time ${emitTime}`);
  console.log(lines.join("\n"));
}

function getTypeFiles(): string[] {
  function findNodeModules(): string | null {
    let dir = __dirname;
    while (true) {
      const nm = path.join(dir, "node_modules");
      if (fs.existsSync(nm)) {
        return nm;
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
    return null;
  }

  const nodeModules = findNodeModules();
  if (!nodeModules) {
    return [];
  }
  return glob.sync(path.join(nodeModules, "@types/**/*.d.ts"));
}

it("watch-api", async () => {
  console.log("==== watch-api ====");
  const srcname = "mysrc.ts";

  const sys = Object.create(ts.sys) as ts.System;
  sys.setTimeout = (callback, ms) => {
    ts.sys.setTimeout(callback, 0);
  };
  sys.readFile = function(path, encoding) {
    if (path === srcname) {
      return `var x: number = ${Math.random()}`;
    }
    return ts.sys.readFile(path, encoding);
  };
  sys.writeFile = function(path, data) {
    console.log(`Write File:: path == ${path}
${data}
`);
    if (writeResolve) {
      writeResolve();
      writeResolve = null;
    }
  };
  let srcUpdateCb: ts.FileWatcherCallback = null;
  sys.watchFile = (path, callback) => {
    if (path === srcname) {
      srcUpdateCb = callback;
    }
    return {
      close: () => {}
    };
  };

  const host = ts.createWatchCompilerHost(
    [srcname],
    {},
    sys,
    null,
    function(d: ts.Diagnostic) {
      console.log(d.messageText);
    },
    function(d: ts.Diagnostic) {
      console.log(d.messageText);
    }
  );
  // Define host.afterProgramCreate to customize tasks after the recreation of program.
  // By default, it emits output files!
  expect(host.createProgram).toBe(
    ts.createEmitAndSemanticDiagnosticsBuilderProgram
  );
  performance.enable();
  const builder = ts.createWatchProgram(host);

  reportTimeStatistic();

  performance.enable();

  let writeResolve = null;
  let writePromise = new Promise<{ path: string; data: string }>(resolve => {
    writeResolve = resolve;
  });

  srcUpdateCb(srcname, ts.FileWatcherEventKind.Changed);
  const start = Date.now();
  await writePromise;
  const end = Date.now();
  reportTimeStatistic();
  expect(end - start).toBeLessThan(100);

  builder.close(); // Not available in typescript3.5.3.
});

it("watch-api-with-config", async () => {
  console.log("==== watch-api-with-config ====");
  const tsConfigName = "mytsconfig.json";
  const srcname = "mysrc.ts";
  const currentDir = ts.sys.getCurrentDirectory();

  const sys = Object.create(ts.sys) as ts.System;
  sys.setTimeout = (callback, ms) => {
    ts.sys.setTimeout(callback, 0);
  };
  sys.readFile = function(path, encoding) {
    console.log("readFile:", path);
    if (path === tsConfigName) {
      return JSON.stringify({
        include: ["mysrc/**/*"]
      });
    }
    if (path === joinPath(currentDir, "mysrc/mysrc.ts")) {
      let ret = `var x: number = ${Math.random()}`;
      console.log(`Return ${ret} as ${path}`);
      return ret;
    }
    return ts.sys.readFile(path, encoding);
  };
  sys.writeFile = function(path, data) {
    console.log(`Write File:: path == ${path}
${data}
`);
    if (writeResolve) {
      writeResolve();
      writeResolve = null;
    }
  };
  // getDrectory list directories under path (See watchUtilities.ts).
  sys.getDirectories = (path: string): string[] => {
    if (path === currentDir) {
      return ["mysrc"];
    }
    if (path === joinPath(currentDir, "mysrc")) {
      return [];
    }
    return ts.sys.getDirectories(path);
  };
  // readDirectory list files under path.
  sys.readDirectory = (path, extensions, exclude, include, depth): string[] => {
    console.log("readDirectory", path);
    if (path === joinPath(currentDir, "mysrc")) {
      return ["mysrc.ts"];
    }
    return ts.sys.readDirectory(path, extensions, exclude, include, depth);
  };
  sys.directoryExists = (path: string): boolean => {
    console.log("directoryExists:", path);
    return ts.sys.directoryExists(path);
  };
  sys.fileExists = (path: string): boolean => {
    console.log("fileExists:", path);
    return ts.sys.fileExists(path);
  };
  let srcUpdateCb: ts.FileWatcherCallback = null;
  sys.watchFile = (path, callback) => {
    console.log("watchFile:", path);
    if (path === joinPath(currentDir, "mysrc/mysrc.ts")) {
      srcUpdateCb = callback;
    }
    return {
      close: () => {}
    };
  };
  sys.watchDirectory = (path, callback, recursive) => {
    console.log("watchDirectory:", path);
    return ts.sys.watchDirectory(path, callback, recursive);
  };

  const host = ts.createWatchCompilerHost(
    tsConfigName,
    {},
    sys,
    null,
    function(d: ts.Diagnostic) {
      console.log(d.messageText);
    },
    function(d: ts.Diagnostic) {
      console.log(d.messageText);
    }
  );
  // Define host.afterProgramCreate to customize tasks after the recreation of program.
  // By default, it emits output files!
  expect(host.createProgram).toBe(
    ts.createEmitAndSemanticDiagnosticsBuilderProgram
  );
  performance.enable();
  const builder = ts.createWatchProgram(host);

  reportTimeStatistic();

  performance.enable();

  let writeResolve = null;
  let writePromise = new Promise<{ path: string; data: string }>(resolve => {
    writeResolve = resolve;
  });

  console.log("srcUpdateCb", srcUpdateCb);
  srcUpdateCb(srcname, ts.FileWatcherEventKind.Changed);
  const start = Date.now();
  await writePromise;
  const end = Date.now();
  reportTimeStatistic();
  expect(end - start).toBeLessThan(100);

  builder.close(); // Not available in typescript3.5.3.
});

it("service-api", async () => {
  console.log("==== service-api ====");
  const srcname = "mysrc.ts";
  let srcVersion = 0;
  let srcContent = "";

  let start: number, end: number;
  const host = createLanguageServiceHost();
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());

  setSrcContent(`var i: number = 10;`);
  performance.enable();
  ts.getPreEmitDiagnostics(service.getProgram());
  let output = service.getEmitOutput(srcname);
  reportTimeStatistic();
  expect(output.emitSkipped).toBeFalsy();
  output.outputFiles.forEach(file => {
    if (file.name === "mysrc.js") {
      expect(file.text).toEqual("var i = 10;\r\n");
    } else if (file.name == "mysrc.d.ts") {
      expect(file.text).toEqual("declare var i: number;\r\n");
    } else {
      fail(`Unexpected file: ${file.name}`);
    }
  });

  setSrcContent(`var j: number = 20;`);
  performance.enable();
  start = Date.now();
  ts.getPreEmitDiagnostics(service.getProgram());
  output = service.getEmitOutput(srcname);
  end = Date.now();
  reportTimeStatistic();
  expect(output.emitSkipped).toBeFalsy();
  // "Check time" is long, it's not cached for some reason.
  expect(end - start).toBeGreaterThan(200);
  output.outputFiles.forEach(file => {
    if (file.name === "mysrc.js") {
      expect(file.text).toEqual("var j = 20;\r\n");
    } else if (file.name === "mysrc.d.ts") {
      expect(file.text).toEqual("declare var j: number;\r\n");
    } else {
      fail(`Unexpected file: ${file.name}`);
    }
  });

  function setSrcContent(content: string) {
    srcVersion++;
    srcContent = content;
  }

  function createLanguageServiceHost(): ts.LanguageServiceHost {
    const files = getTypeFiles();
    files.push(srcname);
    return {
      getScriptFileNames,
      getScriptVersion,
      getScriptSnapshot,
      getCurrentDirectory,
      getCompilationSettings,
      getDefaultLibFileName,
      fileExists,
      readFile,
      readDirectory
    };

    function getProjectVersion() {
      return String(srcVersion);
    }
    function getScriptFileNames() {
      return files;
    }
    function getScriptVersion(path: string) {
      if (path === srcname) {
        return String(srcVersion);
      }
      return "1";
    }
    function getScriptSnapshot(fileName: string): ts.IScriptSnapshot {
      if (fileName === srcname) {
        return ts.ScriptSnapshot.fromString(srcContent);
      }
      return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName).toString());
    }
    function getCurrentDirectory() {
      return process.cwd();
    }
    function getCompilationSettings(): ts.CompilerOptions {
      // typeRoots here is no-op:
      // We may need to implement resolveTypeReferenceDirectives?
      return {
        target: ts.ScriptTarget.ES2017,
        declaration: true
      };
    }
    function getDefaultLibFileName(options: ts.CompilerOptions): string {
      return ts.getDefaultLibFilePath(options);
    }
    function fileExists(path: string) {
      let exist = ts.sys.fileExists(path);
      // console.log("fileExists: ", path, exist);
      return exist;
    }
    function readFile(path: string, encoding?: string): string {
      throw new Error("readFile is not implemented");
    }
    function readDirectory(
      path: string,
      extensions?: ReadonlyArray<string>,
      exclude?: ReadonlyArray<string>,
      include?: ReadonlyArray<string>,
      depth?: number
    ): string[] {
      console.log("readDirectory:", path);
      return ts.sys.readDirectory(path, extensions, exclude, include, depth);
    }
  }
});
