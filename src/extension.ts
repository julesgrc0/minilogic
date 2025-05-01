import * as vscode from "vscode";
import * as path from "path";

import { CodeFix, Lexer, Operators } from "./language/lexer";
import {
  Expression,
  ExpressionType,
  Parser,
  StatementType,
} from "./language/parser";
import { Interpreter } from "./language/interpreter";

import {
  SemanticError,
  SemanticErrorAnalyzer,
} from "./language/semantic/error_analyser";
import { SemanticErrorSolver } from "./language/semantic/error_solver";
import {
  SemanticWarning,
  SemanticWarningAnalyzer,
} from "./language/semantic/warning_analyser";
import { SemanticWarningSolver } from "./language/semantic/warning_solver";

import { convertRange, getCombinations } from "./language/utils";
import { Format } from "./language/format";

let semanticErrors: SemanticError[] = [];
let semanticWarnings: SemanticWarning[] = [];
let variables: string[] = [];
let functions: string[] = [];

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

  const lexer = new Lexer(editor.document.getText());
  const parser = new Parser(lexer.tokenize());

  const ast = parser.parse();
  const errors = new SemanticErrorAnalyzer(ast).analyze();

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
    result = new Interpreter(ast).execute();
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
  const parser = new Parser(lexer.tokenize());

  let formatted: string;
  try {
    formatted = Format.format(parser.parse());
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

  const lexer = new Lexer(document.getText());
  const parser = new Parser(lexer.tokenize());

  const ast = parser.parse();
  const sea = new SemanticErrorAnalyzer(ast);
  semanticErrors = sea.analyze();
  variables = sea.getVariableNames();
  functions = sea.getFunctionNames();

  semanticWarnings = new SemanticWarningAnalyzer(ast).analyze();

  const diagnostics: vscode.Diagnostic[] = [];

  semanticErrors.forEach((error, index) => {
    const diag = new vscode.Diagnostic(
      convertRange(error.object.range),
      error.message,
      vscode.DiagnosticSeverity.Error
    );
    diag.code = `error-${index}`;
    diag.source = "MiniLogic";
    diagnostics.push(diag);
  });
  semanticErrors.forEach((warning, index) => {
    const diag = new vscode.Diagnostic(
      convertRange(warning.object.range),
      warning.message,
      vscode.DiagnosticSeverity.Warning
    );
    diag.code = `warning-${index}`;
    diag.source = "MiniLogic";
    diagnostics.push(diag);
  });

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
  const parser = new Parser(lexer.tokenize());

  const ast = parser.parse();
  const waringSolver = new SemanticWarningSolver(semanticWarnings);
  const errorSolver = new SemanticErrorSolver(
    semanticErrors,
    variables,
    functions
  );

  const fixCode = (basename: string) => {
    return (solution: CodeFix, index: number) => {
      const range = convertRange({ start: solution.start, end: solution.end });
      const fix = new vscode.CodeAction(
        solution.message,
        vscode.CodeActionKind.QuickFix
      );
      const diag = context.diagnostics.filter(
        (d) => d.code === `error-${index}`
      );
      fix.diagnostics = diag.length > 0 ? [diag[0]] : [];
      fix.isPreferred = true;
      fix.edit = new vscode.WorkspaceEdit();
      if (solution.value === null) {
        fix.edit.delete(document.uri, range);
      } else {
        fix.edit.replace(document.uri, range, solution.value);
      }
    };
  };

  errorSolver.solve().forEach(fixCode("error"));
  waringSolver.solve().forEach(fixCode("warning"));

  return fixes;
};

// const actionHoverExpr = (
//   document: vscode.TextDocument,
//   position: vscode.Position,
//   cancel: vscode.CancellationToken
// ) => {
//   const code = document.getText();
//   const lexer = new Lexer(code);
//   const parser = new Parser(lexer);

//   const ast = parser.parseProgram();
//   const token = lexer.getTokenByPosition(position.line, position.character);

//   if (!token) return;

//   const stmt = findStatementById(ast, token.pos);
//   if (!stmt) return;

//   if (stmt.type == StatementType.FunctionDefinition) {
//     const interpreter = new Interpreter(ast);
//     interpreter.run();

//     const funcName = stmt.name;

//     const table = interpreter.generateTruthTableFromFunction(funcName);
//     if (!table) return;

//     const inputs = table.inputs.join(" ");
//     const rows = table.rows
//       .map(([input, output]) => `${input.join(" ")} | ${output}`)
//       .join("\n");

//     const result = `${inputs} | ${funcName}\n${"-".repeat(
//       inputs.length + funcName.length + 3
//     )}\n${rows}`;

//     return new vscode.Hover(
//       `📘 **Truth Table for \`${funcName}\`**\n\n\`\`\`txt\n${result}\n\`\`\``
//     );
//   } else if (stmt.type == StatementType.BuiltinCall) {
//     let doc = "";
//     switch (stmt.name) {
//       case BuiltinType.Export:
//         doc = `${stmt.name}(<arg>): Generates a logisim file for the expression.`;
//         break;
//       case BuiltinType.Graph:
//         doc = `${stmt.name}(<arg>): Generates an ascii logic grath for an expression.`;
//         break;
//       case BuiltinType.Print:
//         doc = `${stmt.name}(<arg>, ...): Displays the output of the expression.`;
//         break;
//       case BuiltinType.Show:
//         doc = `${stmt.name}(<arg>, ...): Displays the expression that will be evaluated.`;
//         break;
//       case BuiltinType.Table:
//         doc = `${stmt.name}(<arg>, ...): Displays the truth table for the expression.`;
//         break;
//       case BuiltinType.Simplify:
//         doc = `${stmt.name}(<arg>, ...): Simplifies the expression.`;
//         break;
//       case BuiltinType.ToNand:
//         doc = `${stmt.name}(<arg>, ...): Converts the expression to NAND gates only.`;
//         break;
//       case BuiltinType.ToNor:
//         doc = `${stmt.name}(<arg>, ...): Converts the expression to NOR gates only.`;
//         break;
//     }

//     return new vscode.Hover(
//       `📘 **Builtin Function: \`${stmt.name}\`**\n\n${doc}`
//     );
//   }
// };

// const actionAutocompleteCode = (
//   document: vscode.TextDocument,
//   position: vscode.Position,
//   cancel: vscode.CancellationToken,
//   context: vscode.CompletionContext
// ) => {
//   const code = document.getText();
//   const lexer = new Lexer(code);
//   const parser = new Parser(lexer);
//   const ast = parser.parseProgram();

//   const interpreter = new Interpreter(ast);
//   interpreter.run();

//   const completions: vscode.CompletionItem[] = [];

//   if (context.triggerCharacter === "[") {
//     const token = lexer.getFirstTokenAtLine(position.line);
//     if (!token) return;

//     const stmt = findStatementById(ast, token.pos);
//     if (
//       !stmt ||
//       stmt.type !== StatementType.FunctionDefinition ||
//       stmt.expression.type !== ExpressionType.TableDefinition
//     ) {
//       return;
//     }

//     const table = new vscode.CompletionItem(
//       "Generate Table Function",
//       vscode.CompletionItemKind.Text
//     );

//     const txt = new vscode.SnippetString();
//     const cmbs = getCombinations(stmt.parameters.length);
//     txt.appendText("\n");
//     for (const cmb of cmbs) {
//       txt.appendText(`${cmb.join("")}, 0\n`);
//     }

//     table.insertText = txt;
//     table.detail = "Empty Table";

//     completions.push(table);
//     return completions;
//   }
//   const token = lexer.getFirstTokenAtLine(position.line);
//   if (!token) return;

//   const stmt = findStatementById(ast, token.pos);
//   if (!stmt) return;

//   try {
//     const nextStmt = ast[ast.indexOf(stmt) + 1];
//     if (nextStmt.type != "Error") {
//       const opts = lexer.getOperators();
//       for (const opt of opts) {
//         const item = new vscode.CompletionItem(
//           opt,
//           vscode.CompletionItemKind.Operator
//         );
//         item.detail = "Operator";

//         const doc = new vscode.MarkdownString();
//         doc.appendMarkdown(`**${opt}**\n\n`);

//         const expr: Expression =
//           opt == Operators.Not
//             ? {
//                 type: ExpressionType.UnaryExpression,
//                 operator: opt,
//                 operand: {
//                   type: ExpressionType.Variable,
//                   name: "A",
//                   reference: false,
//                   id: -1,
//                 },
//                 id: -1,
//               }
//             : {
//                 type: ExpressionType.BinaryExpression,
//                 operator: opt,
//                 left: {
//                   type: ExpressionType.Variable,
//                   name: "A",
//                   reference: false,
//                   id: 0,
//                 },
//                 right: {
//                   type: ExpressionType.Variable,
//                   name: "B",
//                   reference: false,
//                   id: -1,
//                 },
//                 id: -1,
//               };
//         const exprStr = opt == Operators.Not ? "not A" : "A " + opt + " B";
//         const vars = opt == Operators.Not ? ["A"] : ["A", "B"];

//         const truthtable = interpreter.generateTruthTableFromExpression(
//           vars,
//           expr
//         );
//         if (truthtable) {
//           const inputs = truthtable.inputs.join(" ");
//           const rows = truthtable.rows
//             .map(([input, output]) => `${input.join(" ")} | ${output}`)
//             .join("\n");

//           doc.appendCodeblock(
//             `${inputs} | ${exprStr}\n${"-".repeat(
//               inputs.length + exprStr.length + 3
//             )}\n${rows}`,
//             "txt"
//           );
//         }

//         item.documentation = doc;
//         completions.push(item);
//       }
//       return completions;
//     }
//   } catch {}

//   const variables = interpreter.getVariables();
//   for (const variable of variables.keys()) {
//     if (stmt.type === StatementType.Assignment && stmt.variable === variable)
//       continue;

//     const item = new vscode.CompletionItem(
//       variable + (stmt.type === StatementType.FunctionDefinition ? "*" : ""),
//       vscode.CompletionItemKind.Variable
//     );
//     if (stmt.type === StatementType.FunctionDefinition) {
//       item.detail = "Variable Reference";
//     } else {
//       item.detail = "Variable";
//     }

//     const doc = new vscode.MarkdownString();
//     doc.appendMarkdown(`**${variable}** = ${variables.get(variable)}`);
//     item.documentation = doc;
//     completions.push(item);
//   }

//   const functions = interpreter.getFunctions();
//   for (const func of functions.keys()) {
//     if (stmt.type === StatementType.FunctionDefinition && stmt.name === func) {
//       for (const param of stmt.parameters) {
//         const item = new vscode.CompletionItem(
//           param,
//           vscode.CompletionItemKind.Variable
//         );
//         item.detail = "Function Parameter";

//         const doc = new vscode.MarkdownString();
//         doc.appendMarkdown(`**${func}**(${stmt.parameters.join(", ")})`);
//         item.documentation = doc;

//         completions.push(item);
//       }
//       continue;
//     }

//     const funcitem = functions.get(func);
//     if (!funcitem || funcitem.type !== StatementType.FunctionDefinition)
//       continue;

//     const item = new vscode.CompletionItem(
//       func + `(${funcitem.parameters.join(", ")})`,
//       vscode.CompletionItemKind.Function
//     );
//     item.detail = "Function";

//     const truthtable = interpreter.generateTruthTableFromFunction(func);
//     if (truthtable) {
//       const doc = new vscode.MarkdownString();
//       doc.appendMarkdown(`**${func}**(${funcitem.parameters.join(", ")})\n\n`);

//       const inputs = truthtable.inputs.join(" ");
//       const rows = truthtable.rows
//         .map(([input, output]) => `${input.join(" ")} | ${output}`)
//         .join("\n");

//       doc.appendCodeblock(
//         `${inputs} | ${func}\n${"-".repeat(
//           inputs.length + func.length + 3
//         )}\n${rows}`,
//         "txt"
//       );

//       item.documentation = doc;
//     }

//     completions.push(item);
//   }

//   const const0 = new vscode.CompletionItem(
//     "0",
//     vscode.CompletionItemKind.Constant
//   );
//   const0.detail = "Constant";
//   const0.documentation = new vscode.MarkdownString("**0**: Constant value");
//   completions.push(const0);

//   const const1 = new vscode.CompletionItem(
//     "1",
//     vscode.CompletionItemKind.Constant
//   );
//   const1.detail = "Constant";
//   const1.documentation = new vscode.MarkdownString("**1**: Constant value");
//   completions.push(const1);

//   return completions;
// };

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

  // const hoverProvider = vscode.languages.registerHoverProvider("minilogic", {
  //   provideHover: actionHoverExpr,
  // });

  // const autoCompleteProvider = vscode.languages.registerCompletionItemProvider(
  //   "minilogic",
  //   {
  //     provideCompletionItems: actionAutocompleteCode,
  //   },
  //   "(",
  //   ")",
  //   "[",
  //   "=",
  //   " ",
  //   ",",
  //   " ",
  //   "\t",
  //   "\r",
  //   "a",
  //   "b",
  //   "c",
  //   "d",
  //   "e",
  //   "f",
  //   "g",
  //   "h",
  //   "i",
  //   "j",
  //   "k",
  //   "l",
  //   "m",
  //   "n",
  //   "o",
  //   "p",
  //   "q",
  //   "r",
  //   "s",
  //   "t",
  //   "u",
  //   "v",
  //   "w",
  //   "x",
  //   "y",
  //   "z",
  //   "A",
  //   "B",
  //   "C",
  //   "D",
  //   "E",
  //   "F",
  //   "G",
  //   "H",
  //   "I",
  //   "J",
  //   "K",
  //   "L",
  //   "M",
  //   "N",
  //   "O",
  //   "P",
  //   "Q",
  //   "R",
  //   "S",
  //   "T",
  //   "U",
  //   "V",
  //   "W",
  //   "X",
  //   "Y",
  //   "Z",
  //   "0",
  //   "1",
  //   "2",
  //   "3",
  //   "4",
  //   "5",
  //   "6",
  //   "7",
  //   "8",
  //   "9"
  // );

  context.subscriptions.push(
    runCommand,
    formatProvider,
    changeWatcher,
    loadWatcher,
    codeActionProvider,
    // hoverProvider,
    // autoCompleteProvider
  );
}

const diagnosticCollection =
  vscode.languages.createDiagnosticCollection("minilogic");

export function deactivate() {
  diagnosticCollection.clear();
  diagnosticCollection.dispose();
  console.log("❌ MiniLogic Extension Deactivated!");
}
