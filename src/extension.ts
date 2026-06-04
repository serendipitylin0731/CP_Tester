import * as vscode from 'vscode';
import { TesterProvider } from './webview/provider';

export function activate(context: vscode.ExtensionContext) {
    const provider = new TesterProvider(context.extensionUri, context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('cpTester.panel', provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cpTester.runTests', () => {
            provider.runTests();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cpTester.selectFolder', async () => {
            const folderUri = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select Test Data Folder'
            });
            if (folderUri && folderUri[0]) {
                provider.loadFromFolder(folderUri[0].fsPath);
            }
        })
    );
}

export function deactivate() {}
