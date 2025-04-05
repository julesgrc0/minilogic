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

  const fileName = path.basename(editor.document.fileName);
  vscode.window.showInformationMessage(`🔥 Running ${fileName}`);

  const code = editor.document.getText();
  const lexer = new Lexer(code);

  let ast: Statement[];
  try {
    const parser = new Parser(lexer);
    ast = parser.parseProgram();
  } catch (error) {
    // TODO: diagnostic for parser error
    return;
  }

  const semanticAnalyzer = new SemanticAnalyzer(ast);
  const errors = semanticAnalyzer.analyze();
  if (errors.length > 0) {
    return;
  }

  let result: string[];
  try {
    const interpreter = new Interpreter(ast);
    result = interpreter.run();
  } catch {
    // TODO: diagnostic for runtime error
    return;
  }

  const outputChannel = vscode.window.createOutputChannel("MiniLogic");
  outputChannel.show(true);
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

const actionCodeUpdate = (event: vscode.TextDocumentChangeEvent) => {
  if (event.document.languageId !== "minilogic") return;

  const diagnostics: vscode.Diagnostic[] = [];
  const code = event.document.getText();

  const lexer = new Lexer(code);
  let ast: Statement[];
  try {
    const parser = new Parser(lexer);
    ast = parser.parseProgram();
  } catch {
    // TODO: diagnostic for parser error
    return;
  }

  const errors = new SemanticAnalyzer(ast).analyze();
  for (const err of errors) {
    if(err.position === -1) continue;

    const token = lexer.getTokenById(err.position);
    if (!token) continue;

    const range = new vscode.Range(
      new vscode.Position(token.line, token.column),
      new vscode.Position(token.line, token.column + token.value.length)
    );

    diagnostics.push(
      new vscode.Diagnostic(
        range,
        err.message,
        vscode.DiagnosticSeverity.Error 
      )
    );
  }

  diagnosticCollection.set(event.document.uri, diagnostics);
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
