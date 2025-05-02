import * as vscode from "vscode";
import { Lexer } from "../language/lexer";
import { Parser } from "../language/parser";
import { Format } from "../language/format";

export default vscode.languages.registerDocumentFormattingEditProvider(
  "minilogic",
  {
    provideDocumentFormattingEdits: (document: vscode.TextDocument) => {
      if (document.languageId !== "minilogic") return;

      const text = document.getText();
      const lexer = new Lexer(text);
      const parser = new Parser(lexer.tokenize());

      try {
        const formatted = Format.format(parser.parse());
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
