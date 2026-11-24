import { describe, it, expect } from 'vitest';
import path from 'path';
import os from 'os';
import {
  PLATFORM,
  IS_WIN,
  defaultCentralDir,
  defaultScanDirectories,
  defaultComfyDir,
  defaultLlamaCppBinary,
  whichCommand,
  shellQuote,
  comfyPython,
  comfyLaunchScripts
} from './platform.js';

describe('platform defaults', () => {
  it('uses a platform-appropriate central folder', () => {
    const dir = defaultCentralDir();
    expect(typeof dir).toBe('string');
    expect(dir.length).toBeGreaterThan(0);
    if (IS_WIN) expect(dir).toMatch(/^[A-Za-z]:\\/);
    else expect(dir.startsWith(os.homedir())).toBe(true);
  });

  it('returns de-duplicated scan folders for the current platform', () => {
    const dirs = defaultScanDirectories();
    expect(Array.isArray(dirs)).toBe(true);
    expect(dirs.length).toBeGreaterThan(3);
    expect(new Set(dirs).size).toBe(dirs.length);
    for (const dir of dirs) {
      expect(path.isAbsolute(dir)).toBe(true);
    }
  });

  it('uses a platform-appropriate ComfyUI folder and llama binary', () => {
    expect(typeof defaultComfyDir()).toBe('string');
    expect(defaultComfyDir()).not.toBe('');
    const llama = defaultLlamaCppBinary();
    if (IS_WIN) expect(llama.toLowerCase()).toContain('llama-server.exe');
    else expect(llama).toBe('llama-server');
  });

  it('reports the running platform', () => {
    expect(['win32', 'darwin', 'linux']).toContain(PLATFORM);
    expect(IS_WIN).toBe(PLATFORM === 'win32');
  });
});

describe('platform helpers', () => {
  it('finds the Node.js executable in PATH', async () => {
    const node = await whichCommand('node');
    expect(node).toBeTruthy();
  });

  it('quotes shell arguments safely', () => {
    expect(shellQuote('a b')).toBe('"a b"');
    expect(shellQuote('a"b')).toBe('"a\\"b"');
  });

  it('returns a usable ComfyUI Python command and script list', () => {
    const python = comfyPython(os.tmpdir());
    expect(typeof python).toBe('string');
    expect(python.length).toBeGreaterThan(0);
    expect(Array.isArray(comfyLaunchScripts(os.tmpdir()))).toBe(true);
  });
});
