import * as vscode from "vscode";
import { getOrCreateState } from "./state";
import { Interpreter } from "../language/interpreter";
import { Keywords, Operators } from "../language/lexer";
import {
  findNearestToLine,
  hasErrorInExpression,
  RANGE_NOT_SET,
} from "../language/utils";
import {
  Expression,
  ExpressionType,
  Statement,
  StatementType,
} from "../language/parser";

export default vscode.languages.registerCompletionItemProvider(
  "minilogic",
  {
    provideCompletionItems: async (
      document: vscode.TextDocument,
      position: vscode.Position,
      cancel: vscode.CancellationToken,
      context: vscode.CompletionContext,
    ) => {
      const state = getOrCreateState(document);

      const interpreter = new Interpreter(state.ast, async (m) => 0);
      try {
        await interpreter.execute();
      } catch {}

      const completions: vscode.CompletionItem[] = [];

      const currentLine = document.lineAt(position.line).text;
      if (currentLine.trim() === "") return; // SNIPPETS.JSON

      const stmt = findNearestToLine(position.line + 1, state.ast);
      if (!stmt) return;
      const isErrorStmt =
        (stmt.type === StatementType.Variable &&
          hasErrorInExpression(stmt.value)) ||
        (stmt.type === StatementType.Function &&
          hasErrorInExpression(stmt.body));

      let nextStmt: Statement | null;

      const index = state.ast.indexOf(stmt);

      if (index === -1 || index + 1 >= state.ast.length) {
        nextStmt = null;
      } else {
        nextStmt = state.ast[index + 1];
      }

      console.log(stmt, nextStmt);
      if ((nextStmt && nextStmt.type === StatementType.Error) || isErrorStmt) {
        for (const variable of Object.keys(interpreter.variables)) {
          if (stmt.type === StatementType.Variable && stmt.name === variable) {
            continue;
          }

          const isFunction =
            stmt.type == StatementType.Function ||
            stmt.type == StatementType.FunctionTable;

          const item = new vscode.CompletionItem(
            variable + (isFunction ? "*" : ""),
            vscode.CompletionItemKind.Variable,
          );
          if (isFunction) {
            item.detail = "Variable Reference";
          } else {
            item.detail = "Variable";
          }

          const doc = new vscode.MarkdownString();

          let value = interpreter.variables[variable] ?? "X";
          doc.appendMarkdown(`**${variable}** = ${value}`);
          item.documentation = doc;
          completions.push(item);
        }

        for (const func of Object.keys(interpreter.functions)) {
          if (stmt.type === StatementType.Function && stmt.name === func) {
            for (const param of stmt.parameters) {
              const item = new vscode.CompletionItem(
                param,
                vscode.CompletionItemKind.Variable,
              );
              item.detail = "Function Parameter";

              const doc = new vscode.MarkdownString();
              doc.appendMarkdown(`**${func}**(${stmt.parameters.join(", ")})`);
              item.documentation = doc;

              completions.push(item);
            }
            continue;
          }

          const funcitem = interpreter.functions[func];
          if (!funcitem) continue;

          const item = new vscode.CompletionItem(
            func + `(${funcitem.parameters.join(", ")})`,
            vscode.CompletionItemKind.Function,
          );
          item.detail = "Function";

          const table = await interpreter.showTruthTable({
            type: ExpressionType.FunctionCall,
            name: func,
            parameters: funcitem.parameters.map((param) => {
              return {
                type: ExpressionType.Variable,
                name: param,
                reference: false,
                range: RANGE_NOT_SET,
              } as Expression;
            }),
            range: RANGE_NOT_SET,
          });
          const doc = new vscode.MarkdownString();
          doc.appendMarkdown(
            `**${func}**(${funcitem.parameters.join(", ")})\n\n`,
          );

          doc.appendCodeblock(table, "txt");
          item.documentation = doc;

          completions.push(item);
        }
      } else {
        for (const opt of Object.values(Operators)) {
          const item = new vscode.CompletionItem(
            opt,
            vscode.CompletionItemKind.Operator,
          );
          item.detail = "Operator";

          const doc = new vscode.MarkdownString();
          doc.appendMarkdown(`**${opt}**\n\n`);

          const expr: Expression =
            opt == Operators.Not
              ? {
                  type: ExpressionType.Unary,
                  operator: opt,
                  operand: {
                    type: ExpressionType.Variable,
                    name: "A",
                    reference: false,
                    range: RANGE_NOT_SET,
                  },
                  range: RANGE_NOT_SET,
                }
              : {
                  type: ExpressionType.Binary,
                  operator: opt,
                  left: {
                    type: ExpressionType.Variable,
                    name: "A",
                    reference: false,
                    range: RANGE_NOT_SET,
                  },
                  right: {
                    type: ExpressionType.Variable,
                    name: "B",
                    reference: false,
                    range: RANGE_NOT_SET,
                  },
                  range: RANGE_NOT_SET,
                };

          const table = await interpreter.showTruthTable(expr);
          doc.appendCodeblock(table, "txt");

          item.documentation = doc;
          completions.push(item);
        }
        return completions;
      }

      // if (context.triggerCharacter === "[") {
      //   const token = lexer.getFirstTokenAtLine(position.line);
      //   if (!token) return;

      //   const stmt = findStatementById(ast, token.pos);
      //   if (
      //     !stmt ||
      //     stmt.type !== StatementType.FunctionDefinition ||
      //     stmt.expression.type !== ExpressionType.TableDefinition
      //   ) {
      //     return;
      //   }

      //   const table = new vscode.CompletionItem(
      //     "Generate Table Function",
      //     vscode.CompletionItemKind.Text
      //   );

      //   const txt = new vscode.SnippetString();
      //   const cmbs = getCombinations(stmt.parameters.length);
      //   txt.appendText("\n");
      //   for (const cmb of cmbs) {
      //     txt.appendText(`${cmb.join("")}, 0\n`);
      //   }

      //   table.insertText = txt;
      //   table.detail = "Empty Table";

      //   completions.push(table);
      //   return completions;
      // }

      const const0 = new vscode.CompletionItem(
        "0",
        vscode.CompletionItemKind.Constant,
      );
      const0.detail = "Constant";
      const0.documentation = new vscode.MarkdownString("**0**: Constant value");
      completions.push(const0);

      const const1 = new vscode.CompletionItem(
        "1",
        vscode.CompletionItemKind.Constant,
      );
      const1.detail = "Constant";
      const1.documentation = new vscode.MarkdownString("**1**: Constant value");
      completions.push(const1);

      return completions;
    },
  },
  "(",
  ")",
  "[",
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
  "9",
);
