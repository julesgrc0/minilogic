import * as vscode from "vscode";

import run from "./commands/run";
import format from "./commands/format";
import update from "./commands/update";
import quickfix from "./commands/quickfix";

import { diagnosticCollection } from "./commands/state";

export function activate(context: vscode.ExtensionContext) {
  console.log("🔥 MiniLogic Extension Activated!");

  try {
    const changeWatcher = vscode.workspace.onDidChangeTextDocument(update);
    const loadWatcher = vscode.workspace.onDidOpenTextDocument(update);
    vscode.workspace.textDocuments.forEach((doc) => update(doc));

    context.subscriptions.push(
      run,
      format,
      quickfix,
      changeWatcher,
      loadWatcher,
    );
  } catch (error) {
    console.error("Error during activation:", error);
  }
}

export function deactivate() {
  diagnosticCollection.clear();
  diagnosticCollection.dispose();
  console.log("❌ MiniLogic Extension Deactivated!");
}
