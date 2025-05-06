import * as vscode from "vscode";

import { convertRange } from "../language/utils";
import { diagnosticCollection, updateState } from "./state";

export default (
  event: vscode.TextDocumentChangeEvent | vscode.TextDocument,
) => {
  const document: vscode.TextDocument = (event as any).document || event;
  if (document.languageId !== "minilogic") return;

  const state = updateState(document);
  const diagnostics: vscode.Diagnostic[] = [];

  state.a_errors.forEach((error, index) => {
    const diag = new vscode.Diagnostic(
      convertRange(error.object.range),
      error.message,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = `error-${index}`;
    diag.source = "MiniLogic";
    diagnostics.push(diag);
  });

  state.a_warnings.forEach((warning, index) => {
    const diag = new vscode.Diagnostic(
      convertRange(warning.object.range),
      warning.message,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = `warning-${index}`;
    diag.source = "MiniLogic";
    diagnostics.push(diag);
  });

  diagnosticCollection.set(document.uri, diagnostics);
};
