
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
