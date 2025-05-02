import * as vscode from "vscode";
import * as path from "path";
import { Interpreter } from "../language/interpreter";
import { getOrCreateState, updateState } from "./state";

export default vscode.commands.registerCommand("minilogic.runCode", () => {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "minilogic") {
      vscode.window.showErrorMessage("❌ No active MiniLogic file to run!");
      return;
    }

    let state = getOrCreateState(editor.document);

    const output = vscode.window.createOutputChannel("MiniLogic");
    output.show(true);

    const fileName = path.basename(editor.document.fileName);
    output.appendLine(`\n\n🔥 Running ${fileName}...`);

    if (state.a_errors.length > 0) {
      output.appendLine(`❌ Semantic Error(s): ${state.a_errors.length}`);
      state.a_errors.forEach((e) => output.appendLine(e.message));
      return;
    }

    const result = new Interpreter(state.ast).execute();
    output.appendLine("✅ Execution completed successfully!\n⚙️ Result:\n");
    output.appendLine(result.join("\n"));
  } catch (e) {
    vscode.window.showErrorMessage("Unexpected error during execution.");
    console.error(e);
  }
});
