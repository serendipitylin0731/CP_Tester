import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RunResult, JudgeConfig } from './types';

// Use koffi FFI for fast Windows memory queries (~1ms vs ~200ms for PowerShell)
const koffi = require('koffi');

const PROCESS_MEMORY_COUNTERS = koffi.struct('PROCESS_MEMORY_COUNTERS', {
    cb: 'uint32',
    PageFaultCount: 'uint32',
    PeakWorkingSetSize: 'size_t',
    WorkingSetSize: 'size_t',
    QuotaPeakPagedPoolUsage: 'size_t',
    QuotaPagedPoolUsage: 'size_t',
    QuotaPeakNonPagedPoolUsage: 'size_t',
    QuotaNonPagedPoolUsage: 'size_t',
    PagefileUsage: 'size_t',
    PeakPagefileUsage: 'size_t'
});

const kernel32 = koffi.load('kernel32.dll');
const psapi = koffi.load('psapi.dll');

const OpenProcess = kernel32.func('void *__stdcall OpenProcess(uint32 dwDesiredAccess, int32 bInheritHandle, uint32 dwProcessId)');
const CloseHandle = kernel32.func('int32 __stdcall CloseHandle(void *hObject)');
const GetProcessMemoryInfo = psapi.func('int32 __stdcall GetProcessMemoryInfo(void *Process, PROCESS_MEMORY_COUNTERS *ppsmemCounters, uint32 cb)');

const PROCESS_QUERY_INFORMATION = 0x0400;
const PROCESS_VM_READ = 0x0010;

export async function run(
    executablePath: string,
    input: string,
    config: JudgeConfig
): Promise<RunResult> {
    const ext = path.extname(executablePath).toLowerCase();
    const isPython = ext === '.py';

    let command: string;
    let args: string[] = [];

    if (isPython) {
        command = process.platform === 'win32' ? 'python' : 'python3';
        args = [executablePath];
    } else {
        command = executablePath;
    }

    const startTime = Date.now();
    const hrtimeStart = process.hrtime.bigint();

    const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;
    let peakMemory = 0; // KiB

    child.stdout?.on('data', (data) => {
        stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
        stderr += data.toString();
    });

    // Monitor memory periodically - koffi makes this fast enough for 10ms interval
    const doMemCheck = () => {
        if (!child.pid || killed) return;
        const mem = getProcessMemory(child.pid);
        if (mem > peakMemory) {
            peakMemory = mem;
        }
        if (mem > config.memoryLimit * 2 * 1024) {
            clearInterval(memoryInterval);
            clearTimeout(hardTimeout);
            killed = true;
            child.kill('SIGKILL');
        }
    };

    // Start first check immediately, then every 10ms
    doMemCheck();
    const memoryInterval = setInterval(doMemCheck, 10);

    // Hard timeout: kill at 2x
    const hardTimeout = setTimeout(() => {
        clearInterval(memoryInterval);
        killed = true;
        child.kill('SIGKILL');
    }, config.timeLimit * 2);

    // Send input
    child.stdin?.write(input);
    child.stdin?.end();

    return new Promise((resolve) => {
        child.on('close', (exitCode) => {
            clearInterval(memoryInterval);
            clearTimeout(hardTimeout);

            const hrtimeEnd = process.hrtime.bigint();
            const elapsedMs = Number(hrtimeEnd - hrtimeStart) / 1_000_000;
            const wallTime = Date.now() - startTime;
            const time = Math.max(elapsedMs, wallTime); // use wall clock as fallback

            resolve({
                stdout,
                stderr,
                exitCode,
                time: Math.round(time),
                memory: Math.round(peakMemory / 1024), // convert KiB to MiB
                killed,
            });
        });

        child.on('error', (err) => {
            clearInterval(memoryInterval);
            clearTimeout(hardTimeout);

            resolve({
                stdout,
                stderr: stderr || err.message,
                exitCode: -1,
                time: Date.now() - startTime,
                memory: Math.round(peakMemory / 1024),
                killed: true,
            });
        });
    });
}

function getProcessMemory(pid: number): number {
    try {
        if (process.platform === 'win32') {
            return getWindowsMemory(pid);
        } else {
            return getLinuxMemory(pid);
        }
    } catch {
        return 0;
    }
}

function getWindowsMemory(pid: number): number {
    try {
        const hProcess = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid);
        if (!hProcess) return 0;
        const size = koffi.sizeof(PROCESS_MEMORY_COUNTERS);
        const buf = Buffer.alloc(size);
        const ret = GetProcessMemoryInfo(hProcess, buf, size);
        CloseHandle(hProcess);
        if (ret === 0) return 0;
        const pmc: any = koffi.decode(buf, 'PROCESS_MEMORY_COUNTERS');
        // PeakWorkingSetSize is in bytes, convert to KiB
        return Math.floor(pmc.PeakWorkingSetSize / 1024);
    } catch {
        return 0;
    }
}

function getLinuxMemory(pid: number): number {
    try {
        const status = fs.readFileSync(`/proc/${pid}/status`, 'utf-8');
        const match = status.match(/VmRSS:\s+(\d+)\s+kB/);
        if (match) {
            return parseInt(match[1], 10); // already in KiB
        }
        return 0;
    } catch {
        return 0;
    }
}
