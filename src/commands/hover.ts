import * as vscode from "vscode";
import { getOrCreateState } from "./state";
import { findNearestToPosition, RANGE_NOT_SET } from "../language/utils";
import {
  Expression,
  ExpressionType,
  Statement,
  StatementType,
} from "../language/parser";
import { Interpreter } from "../language/interpreter";
import { Keywords } from "../language/lexer";

export default vscode.languages.registerHoverProvider("minilogic", {
  provideHover: async (
    document: vscode.TextDocument,
    position: vscode.Position,
    cancel: vscode.CancellationToken,
  ) => {
    const state = getOrCreateState(document);

    const stmt = findNearestToPosition(
      { line: position.line + 1, column: position.character, offset: -1 },
      state.ast,
    );
    console.log("stmt", stmt);
    if (
      !stmt ||
      (stmt.type !== StatementType.BuiltinCall &&
        stmt.type != StatementType.FunctionTable &&
        stmt.type != StatementType.Function &&
        stmt.type != StatementType.Variable)
    ) {
      return;
    }

    const namerange = {
      ...stmt.range,
      end: {
        line: stmt.range.start.line,
        column: stmt.range.start.column + stmt.name.length,
      },
    };
    if (
      position.line != namerange.start.line ||
      position.character < namerange.start.column ||
      position.character > namerange.end.column
    ) {
      return;
    }

    const interpreter = new Interpreter(state.ast, async (m) => 0);
    if (
      stmt.type == StatementType.Function ||
      stmt.type == StatementType.FunctionTable
    ) {
      let func: Statement & {
        type: StatementType.Function;
      };
      if (stmt.type == StatementType.Function) {
        func = stmt;
      } else {
        func = interpreter.convertFunctionTableToFunction(stmt);
      }
      interpreter.functions[func.name] = func;

      const parameters = [
        ...stmt.parameters,
        ...(stmt.type == StatementType.FunctionTable ? stmt.subparameters : []),
      ].map((param) => {
        return {
          type: ExpressionType.Variable,
          name: param,
          reference: false,
          range: RANGE_NOT_SET,
        } as Expression;
      });
      const table = await interpreter.showTruthTable({
        type: ExpressionType.FunctionCall,
        name: stmt.name,
        parameters,
        range: RANGE_NOT_SET,
      });

      return new vscode.Hover(
        `📘 **Function: \`${stmt.name}\`**\n\n\`\`\`txt\n${table}\n\`\`\``,
      );
    } else if (stmt.type == StatementType.BuiltinCall) {
      let doc = "";
      switch (stmt.name) {
        case Keywords.Print:
          doc = "PRINT(...,<expr>) print the value of the expression";
          break;
        case Keywords.Show:
          doc = "SHOW(...,<expr>) show the value of the expression";
          break;
        case Keywords.Table:
          doc = "TABLE(...,<expr>) show the truth table of the expression";
          break;
        case Keywords.Graph:
          doc = "GRAPH(...,<expr>) show the logic graph of the expression";
          break;
        case Keywords.Export:
          doc =
            "EXPORT(<string>[path], <expr>) export the expression to a *.circ file";
          break;
        case Keywords.Import:
          doc =
            "IMPORT(<string>[path|extension]) import a minilogic file (*.mlc) or an extension file (*.mlcx)";
          break;
        case Keywords.Input:
          doc =
            "INPUT(<string>[message]) prompt the user for a binary input (0 or 1)";
          break;
        case Keywords.ToNand:
          doc = "ToNAND(<expr>) convert the expression to NAND form";
          break;
        case Keywords.ToNor:
          doc = "ToNOR(<expr>) convert the expression to NOR form";
          break;
        case Keywords.SolveSOP:
          doc =
            "SolveSOP(<expr>) solve the expression in SOP form (Quine Product of Sums)";
          break;
        case Keywords.SolvePOS:
          doc =
            "SolvePOS(<expr>) solve the expression in POS form (Quine Sum of Products)";
          break;
      }

      return new vscode.Hover(
        `📘 **Builtin Function: \`${stmt.name}\`**\n\n${doc}`,
      );
    } else if (stmt.type == StatementType.Variable) {
      let value = "X";
      try {
        await interpreter.execute();
        value = interpreter.variables[stmt.name].toString() ?? "X";
      } catch {}

      return new vscode.Hover(`📘 **Variable: \`${stmt.name}\`** = ${value}`);
    }
  },
});
