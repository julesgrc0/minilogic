import * as vscode from "vscode";
import { convertRange } from "../language/utils";
import { getOrCreateState } from "./state";

export default vscode.languages.registerCodeActionsProvider(
  "minilogic",
  {
    provideCodeActions: (
      document: vscode.TextDocument,
      rangedoc: vscode.Range | vscode.Selection,
      context: vscode.CodeActionContext
    ) => {
      if (document.languageId !== "minilogic") return;

      const fixes: vscode.CodeAction[] = [];
      const state = getOrCreateState(document);
      
      const codeAction = (
        basename: "error" | "warning",
        diag: vscode.Diagnostic
      ): vscode.CodeAction | undefined => {
        const index = parseInt(
          (diag.code as `${typeof basename}-${number}`).split("-")[1]
        );
        const solutions =
          basename === "error" ? state.s_errors : state.s_warnings;
        if (index >= solutions.length) return;

        const solution = solutions[index];
        const range = convertRange({
          start: solution.start,
          end: solution.end,
        });
        const fix = new vscode.CodeAction(
          solution.message,
          vscode.CodeActionKind.QuickFix
        );
        fix.diagnostics = [diag];
        fix.isPreferred = true;
        fix.edit = new vscode.WorkspaceEdit();

        console.log(
          `Range: (${range.start.line};${range.start.character}|${solution.start.column}) <-> (${range.end.line};${range.end.character}): `,
          document.getText(range),
          document.getText(range).length
        );

        if (solution.value === null) {
          fix.edit.delete(document.uri, range);
        } else {
          fix.edit.replace(document.uri, range, solution.value);
        }
        return fix;
      };

      for (const diag of context.diagnostics) {
        if (
          diag.severity === vscode.DiagnosticSeverity.Error ||
          diag.severity === vscode.DiagnosticSeverity.Warning
        ) {
          const basename =
            diag.severity === vscode.DiagnosticSeverity.Error
              ? "error"
              : "warning";
          const result = codeAction(basename, diag);
          if (result) {
            fixes.push(result);
          }
        }
      }

      return fixes;
    },
  },
  {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
  }
);
