import { TestCase, TestResult, JudgeConfig, Status } from './types';
import { compile, cleanupExecutable } from './compiler';
import { run } from './runner';
import { validate } from './validator';

export async function judgeFile(
    filePath: string,
    testCases: TestCase[],
    config: JudgeConfig,
    onProgress?: (result: TestResult) => void
): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // Compile first
    const compileResult = await compile(filePath);
    if (!compileResult.success) {
        return testCases.map(tc => ({
            id: tc.id,
            name: tc.name,
            status: Status.CompileError,
            time: 0,
            memory: 0,
            errorMessage: compileResult.error,
        }));
    }

    const executablePath = compileResult.executablePath!;

    try {
        for (const tc of testCases) {
            const pendingResult: TestResult = {
                id: tc.id,
                name: tc.name,
                status: Status.Pending,
                time: 0,
                memory: 0,
            };
            onProgress?.(pendingResult);

            const runResult = await run(executablePath, tc.input, config, tc.expectedOutput);
            
            // Cap time/memory at 2x limit if killed by hard limit
            let displayTime = runResult.time;
            let displayMemory = runResult.memory;
            if (runResult.killed) {
                displayTime = Math.min(displayTime, config.timeLimit * 2);
                displayMemory = Math.min(displayMemory, config.memoryLimit * 2);
            }
            
            const validation = validate(runResult, tc.expectedOutput, config);

            const result: TestResult = {
                id: tc.id,
                name: tc.name,
                status: validation.status,
                time: displayTime,
                memory: displayMemory,
                actualOutput: validation.actualOutput,
                errorMessage: validation.errorMessage,
            };

            results.push(result);
            onProgress?.(result);
        }
    } finally {
        cleanupExecutable(executablePath);
    }

    return results;
}

export * from './types';
