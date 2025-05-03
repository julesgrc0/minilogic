import * as vscode from "vscode";
import { Format } from "../language/format";
import { getOrCreateState } from "./state";

export default vscode.languages.registerDocumentFormattingEditProvider(
  "minilogic",
  {
    provideDocumentFormattingEdits: (document: vscode.TextDocument) => {
      if (document.languageId !== "minilogic") return;
      const { ast, text } = getOrCreateState(document);

      try {
        const formatted = Format.format(ast);
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(text.length)
        );
        return [vscode.TextEdit.replace(fullRange, formatted)];
      } catch {
        vscode.window.showErrorMessage(
          "❌ Formatter Error: Invalid MiniLogic code."
        );
        return;
      }
    },
  }
);
