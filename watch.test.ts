import * as fs from "fs";
import * as ts from "typescript";

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

it("watch-api", async () => {
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

it("service-api", async () => {
  const srcname = "mysrc.ts";
  let srcVersion = 0;
  let srcContent = "";

  let start: number, end: number;
  const host = createLanguageServiceHost();
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());

  setSrcContent(`var i: number = 10;`);
  performance.enable();
  start = Date.now();
  let output = service.getEmitOutput(srcname);
  end = Date.now();
  expect(output.emitSkipped).toBeFalsy();
  expect(end - start).toBeLessThan(1000);
  reportTimeStatistic();
  output.outputFiles.forEach(file => {
    if (file.name === "mysrc.js") {
      expect(file.text).toEqual("var i = 10;\r\n");
    } else {
      fail(`Unexpected file: ${file.name}`);
    }
  });

  setSrcContent(`var j: number = 20;`);
  performance.enable();
  start = Date.now();
  output = service.getEmitOutput(srcname);
  end = Date.now();
  expect(output.emitSkipped).toBeFalsy();
  expect(end - start).toBeLessThan(50);
  reportTimeStatistic();
  output.outputFiles.forEach(file => {
    if (file.name === "mysrc.js") {
      expect(file.text).toEqual("var j = 20;\r\n");
    } else {
      fail(`Unexpected file: ${file.name}`);
    }
  });

  function setSrcContent(content: string) {
    srcVersion++;
    srcContent = content;
  }

  function createLanguageServiceHost(): ts.LanguageServiceHost {
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
      return [srcname];
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
      const cwd = process.cwd();
      console.log("getCurrentDirectory", cwd);
      return cwd;
    }
    function getCompilationSettings(): ts.CompilerOptions {
      return {
        target: ts.ScriptTarget.ES2017
      };
    }
    function getDefaultLibFileName(options: ts.CompilerOptions): string {
      return ts.getDefaultLibFilePath(options);
    }
    function fileExists(path: string) {
      let exist = ts.sys.fileExists(path);
      console.log("fileExists: ", path, exist);
      return exist;
    }
    function readFile(path: string, encoding?: string): string {
      console.log("readFile:", path);
      return ts.sys.readFile(path, encoding);
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
