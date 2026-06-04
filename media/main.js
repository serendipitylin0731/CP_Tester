(function() {
    const vscode = acquireVsCodeApi();

    let testCases = [{ id: 1, input: '', expectedOutput: '' }];
    let folderMode = false;
    let folderPath = '';
    let nextId = 2;
    let currentStatus = 'None';
    let imageFiles = {};

    const els = {
        statusImage: document.getElementById('status-image'),
        timeLimit: document.getElementById('time-limit'),
        memoryLimit: document.getElementById('memory-limit'),
        btnAdd: document.getElementById('btn-add'),
        btnFolder: document.getElementById('btn-folder'),
        btnRun: document.getElementById('btn-run'),
        folderInfo: document.getElementById('folder-info'),
        testCasesContainer: document.getElementById('test-cases'),
        resultsContainer: document.getElementById('results'),
    };

    function init() {
        renderTestCases();
        updateImage('None');
        bindEvents();
        vscode.postMessage({ type: 'getState' });
        vscode.postMessage({ type: 'getImageList' });
    }

    function bindEvents() {
        els.btnAdd.addEventListener('click', () => {
            if (folderMode) {
                alert('Cannot add test cases in folder mode');
                return;
            }
            if (testCases.length >= 5) {
                alert('Maximum 5 test cases allowed');
                return;
            }
            testCases.push({ id: nextId++, input: '', expectedOutput: '' });
            renderTestCases();
        });

        els.btnFolder.addEventListener('click', () => {
            vscode.postMessage({ type: 'selectFolder' });
        });

        els.btnRun.addEventListener('click', () => {
            runTests();
        });
    }

    function renderTestCases() {
        els.testCasesContainer.innerHTML = '';

        if (folderMode) {
            // Show read-only list of test case names
            const div = document.createElement('div');
            div.className = 'section-title';
            div.textContent = `Test Cases from Folder (${testCases.length})`;
            els.testCasesContainer.appendChild(div);

            testCases.forEach(tc => {
                const item = document.createElement('div');
                item.className = 'test-case';
                item.innerHTML = `
                    <div class="test-case-header">
                        <span>${escapeHtml(tc.name || `Case ${tc.id}`)}</span>
                    </div>
                    <label>Input preview:</label>
                    <textarea readonly>${escapeHtml(tc.input.substring(0, 200))}${tc.input.length > 200 ? '...' : ''}</textarea>
                    <label>Expected output preview:</label>
                    <textarea readonly>${escapeHtml(tc.expectedOutput.substring(0, 200))}${tc.expectedOutput.length > 200 ? '...' : ''}</textarea>
                `;
                els.testCasesContainer.appendChild(item);
            });
            return;
        }

        testCases.forEach((tc, index) => {
            const div = document.createElement('div');
            div.className = 'test-case';
            div.dataset.id = tc.id;
            div.innerHTML = `
                <div class="test-case-header">
                    <span>Case ${index + 1}</span>
                    ${testCases.length > 1 ? `<button class="test-case-remove" data-id="${tc.id}">×</button>` : ''}
                </div>
                <label>Input:</label>
                <textarea class="input-area" placeholder="Enter input here...">${escapeHtml(tc.input)}</textarea>
                <label>Expected Output:</label>
                <textarea class="output-area" placeholder="Enter expected output here...">${escapeHtml(tc.expectedOutput)}</textarea>
            `;
            els.testCasesContainer.appendChild(div);
        });

        // Bind remove buttons
        document.querySelectorAll('.test-case-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.target.dataset.id);
                testCases = testCases.filter(t => t.id !== id);
                renderTestCases();
            });
        });

        // Bind input changes
        document.querySelectorAll('.test-case').forEach(el => {
            const id = parseInt(el.dataset.id);
            const inputArea = el.querySelector('.input-area');
            const outputArea = el.querySelector('.output-area');
            inputArea.addEventListener('input', () => {
                const tc = testCases.find(t => t.id === id);
                if (tc) tc.input = inputArea.value;
            });
            outputArea.addEventListener('input', () => {
                const tc = testCases.find(t => t.id === id);
                if (tc) tc.expectedOutput = outputArea.value;
            });
        });
    }

    function runTests() {
        const config = {
            timeLimit: parseInt(els.timeLimit.value) || 1000,
            memoryLimit: parseInt(els.memoryLimit.value) || 256,
        };

        // Collect current test cases
        if (!folderMode) {
            document.querySelectorAll('.test-case').forEach(el => {
                const id = parseInt(el.dataset.id);
                const tc = testCases.find(t => t.id === id);
                if (tc) {
                    tc.input = el.querySelector('.input-area').value;
                    tc.expectedOutput = el.querySelector('.output-area').value;
                }
            });
        }

        // Clear previous results
        els.resultsContainer.innerHTML = '';
        updateImage('Pending');

        vscode.postMessage({
            type: 'runTests',
            testCases,
            config
        });
    }

    const statusFolderMap = {
        'Accepted': 'AC',
        'Compile Error': 'CE',
        'Runtime Error': 'RE',
        'Memory Limit Exceeded': 'MLE',
        'Time Limit Exceeded': 'TLE',
        'Wrong Answer': 'WA',
        'Pending': 'Pending',
        'None': 'None'
    };

    function updateImage(status) {
        currentStatus = status;
        const folder = statusFolderMap[status] || status;
        const files = imageFiles[folder] || imageFiles['None'] || [];
        if (files.length === 0) {
            els.statusImage.src = '';
            return;
        }
        const randomFile = files[Math.floor(Math.random() * files.length)];
        els.statusImage.src = `${window.setsUri}/${folder}/${randomFile}`;
    }

    function showResult(result) {
        let el = document.getElementById(`result-${result.id}`);
        if (!el) {
            el = document.createElement('div');
            el.id = `result-${result.id}`;
            el.className = 'result-item';
            els.resultsContainer.appendChild(el);
        }

        const statusClass = 'status-' + result.status.replace(/\s+/g, '-');
        let extra = '';
        if (result.status === 'Wrong Answer' && result.actualOutput !== undefined) {
            extra = `<div class="result-output"><strong>Your Output:</strong>\n${escapeHtml(result.actualOutput)}</div>`;
        } else if ((result.status === 'Compile Error' || result.status === 'Runtime Error') && result.errorMessage) {
            extra = `<div class="result-error"><strong>Error:</strong>\n${escapeHtml(result.errorMessage)}</div>`;
        }

        el.innerHTML = `
            <div class="result-header">
                <span class="result-name">${escapeHtml(result.name || `Case ${result.id}`)}</span>
                <span class="result-status ${statusClass}">${result.status}</span>
            </div>
            <div class="result-meta">Time: ${result.time}ms | Memory: ${result.memory}MiB</div>
            ${extra}
        `;
    }

    function escapeHtml(str) {
        if (str === undefined || str === null) return '';
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#039;');
    }

    window.addEventListener('message', (event) => {
        const msg = event.data;
        switch (msg.type) {
            case 'state':
                if (msg.testCases && msg.testCases.length > 0) {
                    testCases = msg.testCases;
                    nextId = Math.max(...testCases.map(t => t.id)) + 1;
                }
                folderMode = msg.folderMode || false;
                folderPath = msg.folderPath || '';
                if (folderMode && folderPath) {
                    els.folderInfo.style.display = 'block';
                    els.folderInfo.textContent = `Folder: ${folderPath}`;
                    els.btnAdd.style.display = 'none';
                }
                renderTestCases();
                break;

            case 'result':
                showResult(msg.result);
                break;

            case 'overallStatus':
                updateImage(msg.status);
                break;

            case 'error':
                els.resultsContainer.innerHTML = `<div class="result-error">${escapeHtml(msg.message)}</div>`;
                updateImage('None');
                break;

            case 'folderError':
                els.folderInfo.style.display = 'block';
                els.folderInfo.textContent = `Error: ${msg.message}`;
                break;

            case 'folderLoaded':
                testCases = msg.testCases;
                folderMode = true;
                folderPath = msg.folderPath;
                els.folderInfo.style.display = 'block';
                els.folderInfo.textContent = `Folder: ${folderPath} (${testCases.length} cases)`;
                els.btnAdd.style.display = 'none';
                els.resultsContainer.innerHTML = '';
                renderTestCases();
                break;

            case 'triggerRun':
                runTests();
                break;

            case 'setFolder':
                folderPath = msg.folderPath;
                break;

            case 'imageList':
                imageFiles = msg.images;
                updateImage(currentStatus);
                break;

            case 'clearResults':
                els.resultsContainer.innerHTML = '';
                break;
        }
    });

    init();
})();
