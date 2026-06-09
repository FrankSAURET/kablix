import * as vscode from 'vscode';
import { SimulatorPanel } from './panel';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('microsim.openSimulator', () => {
      SimulatorPanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('microsim.compileAndRun', () => {
      const panel = SimulatorPanel.createOrShow(context.extensionUri);
      void panel.compileActiveFile();
    })
  );
}

export function deactivate(): void {
  SimulatorPanel.dispose();
}
