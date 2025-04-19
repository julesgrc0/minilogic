import * as vscode from "vscode";
import * as path from "path";
import { Lexer } from "./language/lexer";
import { Parser, Statement } from "./language/parser";
import { SemanticAnalyzer } from "./language/semantic_analyzer";
import { Interpreter } from "./language/interpreter";
import { Formatter } from "./language/formatter";
import { Optimizer, StatementOptimizationType } from "./language/optimizer";

const actionRunCode = () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "minilogic") {
    vscode.window.showErrorMessage("❌ No active MiniLogic file to run!");
    return;
  }

  const outputChannel = vscode.window.createOutputChannel("MiniLogic");
  outputChannel.show(true);

  const fileName = path.basename(editor.document.fileName);
  outputChannel.appendLine(`\n\n🔥 Running ${fileName}...`);

  const code = editor.document.getText();

  const lexer = new Lexer(code);
  const parser = new Parser(lexer);

  const ast = parser.parseProgram();
  const errors = new SemanticAnalyzer(ast).analyze();

  if (errors.length > 0) {
    outputChannel.appendLine(
      `❌ Semantic Error: Invalid MiniLogic code, found ${errors.length} error(s) :`
    );
    for (const error of errors) {
      outputChannel.appendLine(`${error.message}`);
    }
    return;
  }

  let result: string[];
  try {
    result = new Interpreter(ast).run();
  } catch (error) {
    outputChannel.appendLine("❌ Interpreter Error: Invalid MiniLogic code.");
    outputChannel.appendLine((error as any).message);
    console.error(error);
    return;
  }

  outputChannel.appendLine("✅ Execution completed successfully!");
  outputChannel.appendLine("⚙️ Result:\n");
  outputChannel.append(result.join("\n"));
};

const actionFormatCode = (document: vscode.TextDocument) => {
  if (document.languageId !== "minilogic") return;

  const text = document.getText();
  const lexer = new Lexer(text);
  const parser = new Parser(lexer);

  const ast = parser.parseProgram();

  let formatted: string;
  try {
    formatted = new Formatter(ast).format();
  } catch {
    vscode.window.showErrorMessage(
      "❌ Formatter Error: Invalid syntax in MiniLogic code."
    );
    return;
  }

  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(text.length)
  );
  return [vscode.TextEdit.replace(fullRange, formatted)];
};

const actionCodeUpdate = (
  event: vscode.TextDocumentChangeEvent | vscode.TextDocument
) => {
  const document: vscode.TextDocument = (event as any).document || event;
  if (document.languageId !== "minilogic") return;

  const diagnostics: vscode.Diagnostic[] = [];
  const code = document.getText();

  const lexer = new Lexer(code);
  const parser = new Parser(lexer);

  const ast = parser.parseProgram();
  const errors = new SemanticAnalyzer(ast).analyze();

  for (const err of errors) {
    if (err.position === -1) continue;

    const token = lexer.getTokenById(err.position);
    if (!token) continue;

    const range = new vscode.Range(
      new vscode.Position(token.line, 0),
      document.lineAt(token.line).range.end
    );

    const diag = new vscode.Diagnostic(
      range,
      err.message,
      vscode.DiagnosticSeverity.Error
    );
    diag.code = err.fixId;
    diagnostics.push(diag);
  }

  const optimizations = new Optimizer(ast).optimize();
  for (const opt of optimizations) {
    const token = lexer.getTokenById(opt.fixId);
    if (!token) continue;

    const range = new vscode.Range(
      new vscode.Position(token.line, 0),
      document.lineAt(token.line).range.end
    );
    const diag = new vscode.Diagnostic(
      range,
      opt.message,
      vscode.DiagnosticSeverity.Warning
    );
    diag.code = opt.fixId;
    diagnostics.push(diag);
  }

  diagnosticCollection.set(document.uri, diagnostics);
};

const actionQuickFix = (
  document: vscode.TextDocument,
  range: vscode.Range | vscode.Selection,
  context: vscode.CodeActionContext
) => {
  if (document.languageId !== "minilogic") return;

  const fixes: vscode.CodeAction[] = [];

  const lexer = new Lexer(document.getText());
  const parser = new Parser(lexer);

  const ast = parser.parseProgram();
  const optimizations = new Optimizer(ast).optimize();

  for (const diag of context.diagnostics) {
    if (diag.severity === vscode.DiagnosticSeverity.Warning) {
      const fix = new vscode.CodeAction(
        diag.message,
        vscode.CodeActionKind.QuickFix
      );

      const fixedCode = optimizations.find((opt) => opt.fixId === diag.code);
      if (!fixedCode) continue;
      
      const token = lexer.getTokenById(diag.code as number);
      if (!token) continue;
      
      const range = new vscode.Range(
        new vscode.Position(token.line, 0),
        document.lineAt(token.line).range.end
      );

      fix.edit = new vscode.WorkspaceEdit();
      if (fixedCode.type === StatementOptimizationType.REMOVE_STATEMENT) {
        fix.edit.delete(document.uri, range);
      }else{
        fix.edit.replace(document.uri, range, fixedCode.line);
      }

      fix.diagnostics = [diag];
      fix.isPreferred = true;
      fixes.push(fix);
    }
  }

  return fixes;
};

export function activate(context: vscode.ExtensionContext) {
  console.log("🔥 MiniLogic Extension Activated!");

  const runCommand = vscode.commands.registerCommand(
    "minilogic.runCode",
    actionRunCode
  );

  const formatProvider =
    vscode.languages.registerDocumentFormattingEditProvider("minilogic", {
      provideDocumentFormattingEdits: actionFormatCode,
    });

  const changeWatcher =
    vscode.workspace.onDidChangeTextDocument(actionCodeUpdate);
  const loadWatcher = vscode.workspace.onDidOpenTextDocument(actionCodeUpdate);

  vscode.workspace.textDocuments.forEach((doc) => actionCodeUpdate(doc));

  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    "minilogic",
    {
      provideCodeActions: actionQuickFix,
    },
    {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }
  );

  /*
  TODO LIST:

  - Add autocomplete for table definition, for example:
      if the user types F(A, B) = [ when the "[" is typed the autecomplete generate the table filled with 0
  - Add autocomplete for functions and variable
  - Add autocomplete for variable reference and variable inside function
  - Add autocomplete for builtin functions
  - Show truth table when hover on function or on operators
  - Add quick fix for errors
  - Show warnings when the optimizer can optimize the code for example:
      A or 1 = 1 so the optimizer higlight the expression and suggest to replace it with 1
  */

  context.subscriptions.push(
    runCommand,
    formatProvider,
    changeWatcher,
    loadWatcher,
    codeActionProvider
  );
}

const diagnosticCollection =
  vscode.languages.createDiagnosticCollection("minilogic");

export function deactivate() {
  diagnosticCollection.clear();
  diagnosticCollection.dispose();
  console.log("❌ MiniLogic Extension Deactivated!");
}
