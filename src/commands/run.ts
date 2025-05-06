import * as vscode from "vscode";
import * as path from "path";
import { Interpreter } from "../language/interpreter";
import { getOrCreateState, updateState } from "./state";
import { BinaryNumber } from "../language/lexer";

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

    const input = async (message: string): Promise<BinaryNumber> => {
      return new Promise((resolve) => {
        const inputBox = vscode.window.createInputBox();
        inputBox.title = message;
        inputBox.placeholder = "Enter a binary number (0 or 1)";
        inputBox.onDidAccept(() => {
          const value = inputBox.value;
          if (value == "0" || value == "1") {
            resolve(parseInt(value) as BinaryNumber);
            inputBox.hide();
            inputBox.dispose();
          } else {
            inputBox.validationMessage =
              "Please enter a valid binary number (0 or 1)";
            inputBox.value = "";
          }
        });
        inputBox.onDidHide(() => {
          inputBox.dispose();
        });
        inputBox.show();
      });
    };

    new Interpreter(state.ast, input)
      .execute()
      .then((result) => {
        output.appendLine("✅ Execution completed successfully!\n⚙️ Result:\n");
        output.appendLine(result.join("\n"));
      })
      .catch((e) => {
        output.appendLine("❌ Execution failed!");
        output.appendLine(e.message);
      });
  } catch (e) {
    vscode.window.showErrorMessage("Unexpected error during execution.");
    console.error(e);
  }
});
