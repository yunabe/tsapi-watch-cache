import * as ts from "typescript";

it("watch-incremental", async () => {
  const performance = (ts as any).performance;
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
});
