import * as vscode from "vscode";
import * as path from "path";
import { Lexer } from "./language/lexer";
import {
  BuiltinType,
  Expression,
  ExpressionType,
  Parser,
  Statement,
  StatementType,
} from "./language/parser";
import { SemanticAnalyzer } from "./language/semantic_analyzer";
import { Interpreter } from "./language/interpreter";
import { Formatter } from "./language/formatter";
import { Optimizer, StatementOptimizationType } from "./language/optimizer";

const isIdInExpression = (expr: Expression, id: number): boolean => {
  if (expr.id === id) return true;

  switch (expr.type) {
    case ExpressionType.BinaryExpression:
      return (
        isIdInExpression(expr.left, id) || isIdInExpression(expr.right, id)
      );
    case ExpressionType.UnaryExpression:
      return isIdInExpression(expr.operand, id);
    case ExpressionType.FunctionCall:
      return expr.args.some((arg) => isIdInExpression(arg, id));
    case ExpressionType.BuiltinCall:
      return isIdInExpression(expr.operand, id);
    case ExpressionType.TableDefinition:
      return expr.rows.some((row) =>
        row.input.some((inp) => inp.some((item) => item.id === id))
      );
    default:
      return false;
  }
};

const findStatementById = (
  ast: Statement[],
  id: number
): Statement | undefined => {
  for (const stmt of ast) {
    if (stmt.id === id) return stmt;

    switch (stmt.type) {
      case StatementType.FunctionDefinition:
      case StatementType.Assignment:
        if (isIdInExpression(stmt.expression, id)) return stmt;
        break;

      case StatementType.BuiltinCall:
        if (stmt.args.some((arg) => isIdInExpression(arg, id))) return stmt;
        break;
      case StatementType.Comment:
        continue;
    }
  }
  return undefined;
};

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
      if (fixedCode.type === StatementOptimizationType.REMOVE) {
        fix.edit.delete(document.uri, range);
      } else {
        fix.edit.replace(document.uri, range, fixedCode.line);
      }

      fix.diagnostics = [diag];
      fix.isPreferred = true;
      fixes.push(fix);
    }
  }

  return fixes;
};

const actionHoverExpr = (
  document: vscode.TextDocument,
  position: vscode.Position,
  cancel: vscode.CancellationToken
) => {
  const code = document.getText();
  const lexer = new Lexer(code);
  const parser = new Parser(lexer);

  const ast = parser.parseProgram();
  const token = lexer.getTokenByPosition(position.line, position.character);

  if (!token) return;

  const stmt = findStatementById(ast, token.pos);
  if (!stmt) return;

  if (stmt.type == StatementType.FunctionDefinition) {
    const interpreter = new Interpreter(ast);
    interpreter.run();

    const funcName = stmt.name;

    const table = interpreter.generateTruthTable(funcName);
    if (!table) return;

    const inputs = table.inputs.join(" ");
    const rows = table.rows
      .map(([input, output]) => `${input.join(" ")} | ${output}`)
      .join("\n");

    const result = `${inputs} | ${funcName}\n${"-".repeat(
      inputs.length + funcName.length + 3
    )}\n${rows}`;

    return new vscode.Hover(
      `📘 **Truth Table for \`${funcName}\`**\n\n\`\`\`txt\n${result}\n\`\`\``
    );
  } else if (stmt.type == StatementType.BuiltinCall) {
    let doc = "";
    switch (stmt.name) {
      case BuiltinType.Export:
        doc = `${stmt.name}(<arg>): Generates a logisim file for the expression.`;
        break;
      case BuiltinType.Graph:
        doc = `${stmt.name}(<arg>): Generates an ascii logic grath for an expression.`;
        break;
      case BuiltinType.Print:
        doc = `${stmt.name}(<arg>, ...): Displays the output of the expression.`;
        break;
      case BuiltinType.Show:
        doc = `${stmt.name}(<arg>, ...): Displays the expression that will be evaluated.`;
        break;
      case BuiltinType.Table:
        doc = `${stmt.name}(<arg>, ...): Displays the truth table for the expression.`;
        break;
      case BuiltinType.Simplify:
        doc = `${stmt.name}(<arg>, ...): Simplifies the expression.`;
        break;
      case BuiltinType.ToNand:
        doc = `${stmt.name}(<arg>, ...): Converts the expression to NAND gates only.`;
        break;
      case BuiltinType.ToNor:
        doc = `${stmt.name}(<arg>, ...): Converts the expression to NOR gates only.`;
        break;
    }

    return new vscode.Hover(
      `📘 **Builtin Function: \`${stmt.name}\`**\n\n${doc}`
    );
  }
};

const actionAutocompleteCode = (
  document: vscode.TextDocument,
  position: vscode.Position,
  cancel: vscode.CancellationToken,
  context: vscode.CompletionContext
) => {
  const code = document.getText();
  const lexer = new Lexer(code);
  const parser = new Parser(lexer);
  const ast = parser.parseProgram();

  const interpreter = new Interpreter(ast);
  interpreter.run();

  const completions: vscode.CompletionItem[] = [];

  

  const token = lexer.getFirstTokenAtLine(position.line);
  if (!token) return;
    
  const stmt = findStatementById(ast, token.pos);
  if (!stmt)  return;
  
  try{
    const nextStmt = ast[ast.indexOf(stmt) + 1];
    console.log(nextStmt);
    if(nextStmt.type != "Error") {
      const opts = lexer.getOperators();
      for (const opt of opts) {
        const item = new vscode.CompletionItem(
          opt,
          vscode.CompletionItemKind.Operator
        );
        item.detail = "Operator";
        completions.push(item);
      }
      return completions;
    }
  }catch{}
  

  const variables = interpreter.getVariables();
  for (const variable of variables.keys()) {
    if (stmt.type === StatementType.Assignment && stmt.variable === variable)
      continue;

    const item = new vscode.CompletionItem(
      variable + (stmt.type === StatementType.FunctionDefinition ? "*" : ""),
      vscode.CompletionItemKind.Variable
    );
    if (stmt.type === StatementType.FunctionDefinition) {
      item.detail = "Variable Reference";
    } else {
      item.detail = "Variable";
    }

    const doc = new vscode.MarkdownString();
    doc.appendMarkdown(`**${variable}** = ${variables.get(variable)}`);
    item.documentation = doc;
    completions.push(item);
  }

  const functions = interpreter.getFunctions();
  for (const func of functions.keys()) {
    if (stmt.type === StatementType.FunctionDefinition && stmt.name === func) {
      for (const param of stmt.parameters) {
        const item = new vscode.CompletionItem(
          param,
          vscode.CompletionItemKind.Variable
        );
        item.detail = "Function Parameter";

        const doc = new vscode.MarkdownString();
        doc.appendMarkdown(`**${func}**(${stmt.parameters.join(", ")})`);
        item.documentation = doc;

        completions.push(item);
      }
      continue;
    }


    const funcitem = functions.get(func);
    if (!funcitem || funcitem.type !== StatementType.FunctionDefinition) continue;

    const item = new vscode.CompletionItem(
      func + `(${funcitem.parameters.join(", ")})`,
      vscode.CompletionItemKind.Function
    );
    item.detail = "Function";

    const truthtable = interpreter.generateTruthTable(func);
    if (truthtable) {
      const doc = new vscode.MarkdownString();
      doc.appendMarkdown(`**${func}**(${funcitem.parameters.join(", ")})\n\n`);

      const inputs = truthtable.inputs.join(" ");
      const rows = truthtable.rows
        .map(([input, output]) => `${input.join(" ")} | ${output}`)
        .join("\n");

      doc.appendCodeblock(
        `${inputs} | ${func}\n${"-".repeat(
          inputs.length + func.length + 3
        )}\n${rows}`,
        "txt"
      );

      item.documentation = doc;
    }

    completions.push(item);
  }

  return completions;
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

  const hoverProvider = vscode.languages.registerHoverProvider("minilogic", {
    provideHover: actionHoverExpr,
  });

  const autoCompleteProvider = vscode.languages.registerCompletionItemProvider(
    "minilogic",
    {
      provideCompletionItems: actionAutocompleteCode,
    },
    "(",
    ")",
    "=",
    " ",
    ",",
    " ",
    "\t",
    "\r",
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9"
  );
  /*
  TODO LIST:

  - Add autocomplete for table definition, for example:
      if the user types F(A, B) = [ when the "[" is typed the autecomplete generate the table filled with 0
  - Add quick fix for errors
  */

  context.subscriptions.push(
    runCommand,
    formatProvider,
    changeWatcher,
    loadWatcher,
    codeActionProvider,
    hoverProvider,
    autoCompleteProvider
  );
}

const diagnosticCollection =
  vscode.languages.createDiagnosticCollection("minilogic");

export function deactivate() {
  diagnosticCollection.clear();
  diagnosticCollection.dispose();
  console.log("❌ MiniLogic Extension Deactivated!");
}
