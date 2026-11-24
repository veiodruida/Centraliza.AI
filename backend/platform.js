'use strict';

/**
 * Cross-platform helpers for Centraliza.ai (v0.6.1).
 *
 * The application started as a Windows-first dashboard. This module centralises
 * every OS-specific decision (default folders, process termination, opening
 * folders/URLs, terminal launch and Windows/Linux/macOS detection) so the
 * server and the engine manager share the same behaviour on all three systems.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec, execFile, spawn } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const PLATFORM = os.platform();
const IS_WIN = PLATFORM === 'win32';
const IS_MAC = PLATFORM === 'darwin';
const IS_LINUX = PLATFORM === 'linux';

function homePath(...parts) {
  return path.join(os.homedir(), ...parts);
}

/** Central model folder: C:\AI_Models on Windows, ~/AI_Models elsewhere. */
function defaultCentralDir() {
  return IS_WIN ? 'C:\\AI_Models' : homePath('AI_Models');
}

/** Common model folders for the current platform. */
function defaultScanDirectories() {
  const dirs = [
    homePath('.cache', 'lm-studio', 'models'),
    homePath('.lmstudio', 'models'),
    homePath('.ollama', 'models', 'blobs'),
    homePath('.cache', 'huggingface', 'hub'),
    homePath('llama.cpp', 'models'),
    homePath('ComfyUI', 'models'),
    homePath('Documents', 'ComfyUI', 'models')
  ];
  if (IS_WIN) {
    dirs.splice(1, 0, homePath('AppData', 'Roaming', 'StabilityMatrix', 'Models'));
  } else if (IS_MAC) {
    dirs.push(homePath('Library', 'Application Support', 'StabilityMatrix', 'Models'));
  } else {
    dirs.push(homePath('.local', 'share', 'StabilityMatrix', 'Models'));
  }
  return [...new Set(dirs)];
}

/** Default ComfyUI installation folder for the current platform. */
function defaultComfyDir() {
  if (IS_WIN) return 'C:\\ComfyUI_windows_portable';
  return homePath('ComfyUI');
}

/** Default llama-server binary (portable builds use the executable name on Unix). */
function defaultLlamaCppBinary() {
  return IS_WIN
    ? homePath('llama.cpp', 'build', 'bin', 'Release', 'llama-server.exe')
    : 'llama-server';
}

/** Resolve an executable in PATH using where/command -v. */
async function whichCommand(cmd) {
  try {
    const { stdout } = await execAsync(IS_WIN ? `where ${cmd}` : `command -v ${cmd}`, {
      timeout: 2500,
      windowsHide: true
    });
    return String(stdout || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)[0] || null;
  } catch (error) {
    const stdout = error && error.stdout ? String(error.stdout) : '';
    return stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)[0] || null;
  }
}

/** Terminate a process tree. Windows uses taskkill; Unix uses SIGKILL on the PID. */
function killProcess(pid, { force = true } = {}) {
  if (!pid) return;
  if (IS_WIN) {
    exec(`taskkill /F /T /PID ${pid}`, { windowsHide: true }, () => {});
    return;
  }
  try { process.kill(Number(pid), force ? 'SIGKILL' : 'SIGTERM'); } catch (e) { /* already gone */ }
}

/** Kill processes by image/pattern name (best effort). */
function killProcessByName(name) {
  if (!name) return;
  if (IS_WIN) {
    exec(`taskkill /F /T /IM "${name}"`, { windowsHide: true }, () => {});
  } else {
    exec(`pkill -9 -f ${JSON.stringify(String(name))}`, () => {});
  }
}

/** Find the PID listening on a TCP port (Windows netstat, lsof/fuser on Unix). */
async function pidOnPort(port) {
  const p = Number(port);
  if (!Number.isFinite(p) || p <= 0) return null;
  try {
    if (IS_WIN) {
      const { stdout } = await execAsync(`netstat -ano | findstr :${p}`, { timeout: 2500, windowsHide: true });
      for (const line of String(stdout || '').split(/\r?\n/)) {
        if (!/listen/i.test(line)) continue;
        const match = line.trim().match(/\s+(\d+)\s*$/);
        if (match) return parseInt(match[1], 10);
      }
      return null;
    }
    const { stdout } = await execAsync(`lsof -nP -iTCP:${p} -sTCP:LISTEN -t`, { timeout: 2500 });
    const first = String(stdout || '').split(/\s+/).find(Boolean);
    if (first) return parseInt(first, 10);
  } catch (e) { /* lsof may not be installed */ }
  if (!IS_WIN) {
    try {
      const { stdout } = await execAsync(`fuser ${p}/tcp 2>/dev/null`, { timeout: 2000 });
      const first = String(stdout || '').trim().split(/\s+/).find(Boolean);
      if (first) return parseInt(first, 10);
    } catch (e) { /* no fuser */ }
  }
  return null;
}

/**
 * Open a folder (or reveal a file) in the native file manager.
 * `select` reveals the file inside its folder when supported.
 */
function openPath(target, { select = false } = {}) {
  const raw = String(target || '').trim();
  if (!raw) return;
  let resolved = raw;
  try { resolved = fs.realpathSync(raw); } catch (e) { resolved = path.resolve(raw); }
  let isDir = false;
  try { isDir = fs.statSync(resolved).isDirectory(); } catch (e) { isDir = false; }
  const folder = isDir ? resolved : path.dirname(resolved);

  if (IS_WIN) {
    const arg = !isDir && select ? `/select,"${resolved}"` : `"${folder}"`;
    exec(`explorer.exe ${arg}`, { windowsHide: true }, () => {});
    return;
  }
  if (IS_MAC) {
    execFile('open', select && !isDir ? ['-R', resolved] : [folder], () => {});
    return;
  }
  execFile('xdg-open', [folder], () => {});
}

/** Open an URL in the default browser. */
function openUrl(url) {
  if (!url) return;
  if (IS_WIN) {
    execFile('cmd', ['/c', 'start', '', String(url)], { windowsHide: true }, () => {});
    return;
  }
  execFile(IS_MAC ? 'open' : 'xdg-open', [String(url)], () => {});
}

function shellQuote(value) {
  return JSON.stringify(String(value || ''));
}

/**
 * Open a command in a visible terminal window. Used by the legacy /api/launch
 * action for interactive engines (ollama run, llama-cli, ComfyUI).
 */
async function openTerminal(command, { cwd = process.cwd(), title = 'Centraliza.ai' } = {}) {
  const commandText = `cd ${shellQuote(cwd)} && ${command}`;
  if (IS_WIN) {
    try {
      const launcher = path.join(os.tmpdir(), `centraliza-launch-${Date.now()}.cmd`);
      fs.writeFileSync(launcher, `@echo off\r\ntitle ${String(title).replace(/[\r\n"]/g, '')}\r\ncd /d "${cwd}"\r\n${command}\r\npause\r\n`, 'utf8');
      exec(`start "" "${launcher}"`, { windowsHide: true }, () => {});
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  if (IS_MAC) {
    const script = `tell application "Terminal" to do script ${shellQuote(commandText)}\ntell application "Terminal" to activate`;
    try {
      await execAsync(`osascript -e ${shellQuote(script)}`, { timeout: 10000 });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  const candidates = [
    ['x-terminal-emulator', ['-e', 'bash', '-lc', `${commandText}; exec bash`]],
    ['gnome-terminal', ['--', 'bash', '-lc', `${commandText}; exec bash`]],
    ['konsole', ['-e', 'bash', '-lc', `${commandText}; exec bash`]],
    ['xfce4-terminal', ['--command', `bash -lc ${shellQuote(`${commandText}; exec bash`)}`]],
    ['xterm', ['-e', 'bash', '-lc', `${commandText}; exec bash`]]
  ];
  for (const [bin, args] of candidates) {
    if (!(await whichCommand(bin))) continue;
    try {
      const child = spawn(bin, args, { cwd, detached: true, stdio: 'ignore' });
      child.unref();
      return { success: true, terminal: bin };
    } catch (e) { /* try next terminal */ }
  }
  return { success: false, error: 'No graphical terminal found. Run the command manually in a terminal.' };
}

/** First existing Python interpreter for a ComfyUI installation. */
function comfyPython(comfyDir) {
  const candidates = IS_WIN
    ? [
        path.join(comfyDir, 'python_embeded', 'python.exe'),
        path.join(comfyDir, 'venv', 'Scripts', 'python.exe'),
        path.join(comfyDir, '.venv', 'Scripts', 'python.exe'),
        'python.exe'
      ]
    : [
        path.join(comfyDir, 'venv', 'bin', 'python'),
        path.join(comfyDir, '.venv', 'bin', 'python'),
        'python3',
        'python'
      ];
  for (const candidate of candidates) {
    if (!candidate.includes(path.sep) && !candidate.includes('/')) return candidate;
    try { if (fs.existsSync(candidate)) return candidate; } catch (e) { /* ignore */ }
  }
  return IS_WIN ? 'python.exe' : 'python3';
}

/** ComfyUI launch scripts, preferring the GPU launchers on Windows. */
function comfyLaunchScripts(comfyDir) {
  const names = IS_WIN
    ? ['run_nvidia_gpu.bat', 'run_cpu.bat', 'run.bat']
    : ['run_nvidia_gpu.sh', 'run_cpu.sh', 'run.sh'];
  return names.map(name => path.join(comfyDir, name)).filter(file => {
    try { return fs.existsSync(file); } catch (e) { return false; }
  });
}

module.exports = {
  PLATFORM,
  IS_WIN,
  IS_MAC,
  IS_LINUX,
  homePath,
  defaultCentralDir,
  defaultScanDirectories,
  defaultComfyDir,
  defaultLlamaCppBinary,
  whichCommand,
  killProcess,
  killProcessByName,
  pidOnPort,
  openPath,
  openUrl,
  openTerminal,
  comfyPython,
  comfyLaunchScripts,
  shellQuote
};
