import * as vscode from "vscode";
import * as path from "path";
import { Lexer } from "./language/lexer";
import { Parser, Statement } from "./language/parser";
import { SemanticAnalyzer } from "./language/semantic_analyzer";
import { Interpreter } from "./language/interpreter";
import { Formatter } from "./language/formatter";

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

  let ast: Statement[];
  try {
    const parser = new Parser(lexer);
    ast = parser.parseProgram();
  } catch (error) {
    outputChannel.appendLine(
      "❌ Parser Error: Invalid syntax in MiniLogic code."
    );
    outputChannel.appendLine((error as any).message);
    return;
  }

  const semanticAnalyzer = new SemanticAnalyzer(ast);
  const errors = semanticAnalyzer.analyze();
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
    const interpreter = new Interpreter(ast);
    result = interpreter.run();
  } catch (error) {
    outputChannel.appendLine("❌ Interpreter Error: Invalid MiniLogic code.");
    outputChannel.appendLine((error as any).message);
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

  let ast: Statement[];
  try {
    const parser = new Parser(lexer);
    ast = parser.parseProgram();
  } catch {
    vscode.window.showErrorMessage(
      "❌ Parser Error: Invalid syntax in MiniLogic code."
    );
    return;
  }

  const formatted = new Formatter(ast).format();
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
  let ast: Statement[];
  try {
    const parser = new Parser(lexer);
    ast = parser.parseProgram();
  } catch (error) {
    diagnostics.push(
      new vscode.Diagnostic(
        new vscode.Range(0, 0, document.lineCount, 0),
        `Parser Error: ${(error as Error).message}`,
        vscode.DiagnosticSeverity.Error
      )
    );
    diagnosticCollection.set(document.uri, diagnostics);
    return;
  }

  const errors = new SemanticAnalyzer(ast).analyze();
  for (const err of errors) {
    if (err.position === -1) continue;

    const token = lexer.getTokenById(err.position);
    if (!token) continue;

    const range = new vscode.Range(
      new vscode.Position(token.line, token.column),
      new vscode.Position(token.line, token.column + token.value.length)
    );

    diagnostics.push(
      new vscode.Diagnostic(range, err.message, vscode.DiagnosticSeverity.Error)
    );
  }

  diagnosticCollection.set(document.uri, diagnostics);
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

  // TODO: with optimizer class

  // const codeActionProvider = vscode.languages.registerCodeActionsProvider(
  //   "minilogic",
  //   {
  //     provideCodeActions(document, range, context) {
  //       const fixes: vscode.CodeAction[] = [];

  //       for (const diagnostic of context.diagnostics) {
  //         if (diagnostic.message.includes("undefined function")) {
  //           const fix = new vscode.CodeAction(
  //             "💡 Create stub for function",
  //             vscode.CodeActionKind.QuickFix
  //           );
  //           fix.edit = new vscode.WorkspaceEdit();
  //           const insertLine = document.lineCount;
  //           const fnName = document.getText(diagnostic.range);
  //           fix.edit.insert(
  //             document.uri,
  //             new vscode.Position(insertLine, 0),
  //             `\n${fnName}(A) = 0\n`
  //           );
  //           fix.diagnostics = [diagnostic];
  //           fix.isPreferred = true;
  //           fixes.push(fix);
  //         }
  //       }

  //       return fixes;
  //     },
  //   },
  //   {
  //     providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
  //   }
  // );

  context.subscriptions.push(
    runCommand,
    formatProvider,
    changeWatcher,
    loadWatcher
    // codeActionProvider
  );
}

const diagnosticCollection =
  vscode.languages.createDiagnosticCollection("minilogic");

export function deactivate() {
  diagnosticCollection.clear();
  diagnosticCollection.dispose();
  console.log("❌ MiniLogic Extension Deactivated!");
}
