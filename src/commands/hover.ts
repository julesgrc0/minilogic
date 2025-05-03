// const hoverProvider = vscode.languages.registerHoverProvider("minilogic", {
//   provideHover: actionHoverExpr,
// });

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
