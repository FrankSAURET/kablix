import * as vscode from 'vscode';
import { SimulatorPanel } from './panel';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('kablix.openSimulator', () => {
      SimulatorPanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('kablix.compileAndRun', () => {
      const panel = SimulatorPanel.createOrShow(context.extensionUri);
      void panel.compileActiveFile();
    }),
    vscode.commands.registerCommand('kablix.loadWorkspaceArtifact', () => {
      const panel = SimulatorPanel.createOrShow(context.extensionUri);
      void panel.loadWorkspaceArtifact();
    })
  );
}

export function deactivate(): void {
  SimulatorPanel.dispose();
}
