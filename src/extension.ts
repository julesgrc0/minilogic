import * as vscode from "vscode";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
  console.log("🔥 MiniLogic Extension Activated!");

  let runCommand = vscode.commands.registerCommand("minilogic.runCode", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("❌ No active MiniLogic file to run !");
      return;
    }

    const document = editor.document;
    if (document.languageId !== "minilogic") {
      vscode.window.showErrorMessage("❌ Not a MiniLogic file !");
      return;
    }

    const fileName = path.basename(document.fileName);
    vscode.window.showInformationMessage(`🔥 Running ${fileName}`);

    try {
      const code = document.getText();
      const output = code.length + " ";

      const outputChannel = vscode.window.createOutputChannel("MiniLogic");
      outputChannel.show(true);
      outputChannel.appendLine(output);
    } catch (error) {
      vscode.window.showErrorMessage(`MiniLogic Error: ${error}`);
    }
  });

  context.subscriptions.push(runCommand);
}

export function deactivate() {
  console.log("❌ MiniLogic Extension Deactivated!");
}
