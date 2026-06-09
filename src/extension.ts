import * as vscode from 'vscode';
import { SimulatorPanel } from './panel';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('microsim.openSimulator', () => {
      SimulatorPanel.createOrShow(context.extensionUri);
    })
  );
}

export function deactivate(): void {
  SimulatorPanel.dispose();
}
