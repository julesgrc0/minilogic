import { Keywords } from "../lexer";
import {
  Expression,
  ExpressionType,
  Statement,
  StatementType,
} from "../parser";

enum SemanticWarningType {
  ExpressionOptimized,
  VariableUnused,
  FunctionUnused,
  FunctionUnusedParameter,
}

type SemanticWarning = {
  type: SemanticWarningType;
  message: string;

  object: Statement | Expression;
  new_object?: Statement | Expression;
};

class SemanticWarningAnalyser {
  private variables: Record<string, { stmt: Statement; count: number }> = {};
  private functions: Record<string, { stmt: Statement; count: number }> = {};

  private warnings: SemanticWarning[] = [];
  private messages: Record<SemanticWarningType, string> = {
    [SemanticWarningType.ExpressionOptimized]: "Expression can be optimized",
    [SemanticWarningType.VariableUnused]: "Variable {0} is unused",
    [SemanticWarningType.FunctionUnused]: "Function {0} is unused",
    [SemanticWarningType.FunctionUnusedParameter]:
      "Function {0} has {1} unused parameters ({2})",
  };

  public constructor(private program: Statement[]) {}

  public analyze(): SemanticWarning[] {
    for (const stmt of this.program) {
      switch (stmt.type) {
        case StatementType.Variable:
          this.checkVariableStatement(stmt);
          break;
        case StatementType.Function:
          this.checkFunctionStatement(stmt);
          break;
        case StatementType.FunctionTable:
          this.checkFunctionTableStatement(stmt);
          break;
        case StatementType.BuiltinCall:
          this.checkBuiltinCallStatement(stmt);
          break;
      }
    }

    for (const variable of Object.keys(this.variables)) {
      if (this.variables[variable].count == 0) {
        this.pushWarning(
          SemanticWarningType.VariableUnused,
          [variable],
          this.variables[variable].stmt
        );
      }
    }

    for (const func of Object.keys(this.functions)) {
      if (this.functions[func].count == 0) {
        this.pushWarning(
          SemanticWarningType.FunctionUnused,
          [func],
          this.functions[func].stmt
        );
      }
    }

    return this.warnings;
  }

  private pushWarning(
    type: SemanticWarningType,
    replace: string[] | null,
    object: Statement | Expression,
    new_object: Statement | Expression | undefined = undefined
  ): void {
    let message = this.messages[type];

    if (replace) {
      replace.forEach((r, i) => {
        message = message.replace(`{${i}}`, r);
      });
    }

    this.warnings.push({
      type,
      message,
      object,
      new_object,
    });
  }

  private checkVariableStatement(stmt: Statement) {
    if (stmt.type !== StatementType.Variable) return;

    if (this.variables.hasOwnProperty(stmt.name)) {
      this.variables[stmt.name] = { stmt, count: 0 };
    }
    this.updateExpressionCount(stmt.value);

    let new_object = this.removeDeadExpression(stmt.value);
    if (new_object) {
      this.pushWarning(
        SemanticWarningType.ExpressionOptimized,
        null,
        stmt,
        new_object
      );
      return;
    }

    new_object = this.simplifyNotExpression(stmt.value);
    if (new_object) {
      this.pushWarning(
        SemanticWarningType.ExpressionOptimized,
        null,
        stmt,
        new_object
      );
      return;
    }
  }

  private checkFunctionStatement(stmt: Statement) {
    if (stmt.type !== StatementType.Function) return;

    if (this.functions.hasOwnProperty(stmt.name)) {
      this.functions[stmt.name] = { stmt, count: 0 };
    }
    this.updateExpressionCount(stmt.body, true);

    const unused = this.findUnusedFunctionParameters(stmt);
    if (unused.length > 0) {
      this.pushWarning(
        SemanticWarningType.FunctionUnusedParameter,
        [stmt.name, unused.length.toString(), unused.join(", ")],
        stmt,
        {
          ...stmt,
          parameters: stmt.parameters.filter((p) => !unused.includes(p)),
        }
      );
    }

    let new_object = this.removeDeadExpression(stmt.body);
    if (new_object) {
      this.pushWarning(
        SemanticWarningType.ExpressionOptimized,
        null,
        stmt,
        new_object
      );
    }

    new_object = this.simplifyNotExpression(stmt.body);
    if (new_object) {
      this.pushWarning(
        SemanticWarningType.ExpressionOptimized,
        null,
        stmt,
        new_object
      );
    }
  }

  private checkFunctionTableStatement(stmt: Statement) {
    if (stmt.type !== StatementType.FunctionTable) return;

    if (this.functions.hasOwnProperty(stmt.name)) {
      this.functions[stmt.name] = { stmt, count: 0 };
    }

    const unused = this.findUnusedFunctionTableParameters(stmt);
    if (unused.length > 0) {
      this.pushWarning(
        SemanticWarningType.FunctionUnusedParameter,
        [stmt.name, unused.length.toString(), unused.join(", ")],
        stmt,
        {
          ...stmt,
          parameters: stmt.parameters.filter((p) => !unused.includes(p)),
        }
      );
    }

    for (const expr of stmt.table) {
      this.updateExpressionCount(expr.value, true);

      let new_object = this.removeDeadExpression(expr.value);
      if (new_object) {
        this.pushWarning(
          SemanticWarningType.ExpressionOptimized,
          null,
          stmt,
          new_object
        );
      }

      new_object = this.simplifyNotExpression(expr.value);
      if (new_object) {
        this.pushWarning(
          SemanticWarningType.ExpressionOptimized,
          null,
          stmt,
          new_object
        );
      }
    }
  }

  private checkBuiltinCallStatement(stmt: Statement) {
    if (stmt.type !== StatementType.BuiltinCall) return;

    const needReference = ![
      Keywords.Print,
      Keywords.Show,
      Keywords.Export,
    ].includes(stmt.name);

    for (const param of stmt.parameters) {
      this.updateExpressionCount(param, needReference);
    }
  }

  private updateExpressionCount(
    expr: Expression,
    needReference: boolean = false
  ) {
    const checkExpression = (expr: Expression) => {
      switch (expr.type) {
        case ExpressionType.Variable:
          if (
            this.variables.hasOwnProperty(expr.name) &&
            (needReference || expr.reference)
          ) {
            this.variables[expr.name].count++;
          }
          break;
        case ExpressionType.BuiltinCall:
        case ExpressionType.FunctionCall:
          if (
            expr.type == ExpressionType.FunctionCall &&
            this.functions.hasOwnProperty(expr.name)
          ) {
            this.functions[expr.name].count++;
          }
          expr.parameters.forEach((param) => checkExpression(param));
          break;
        case ExpressionType.Binary:
          checkExpression(expr.left);
          checkExpression(expr.right);
          break;
        case ExpressionType.Unary:
          checkExpression(expr.operand);
          break;
      }
    };
  }

  private removeDeadExpression(expr: Expression): Expression | null {
    return null;
  }
  private simplifyNotExpression(expr: Expression): Expression | null {
    return null;
  }

  private findUnusedFunctionParameters(stmt: Statement): string[] {
    if (stmt.type !== StatementType.Function) return [];

    return [];
  }

  private findUnusedFunctionTableParameters(stmt: Statement): string[] {
    if (stmt.type !== StatementType.FunctionTable) return [];
    return [];
  }

  //   private removeDeadCode(expr: Expression): Expression {
  //     if (expr.type === ExpressionType.BinaryExpression) {
  //       const left = this.removeDeadCode(expr.left);
  //       const right = this.removeDeadCode(expr.right);

  //       if (expr.operator === Operators.Or) {
  //         if (left.type === ExpressionType.Number && left.value === 1)
  //           return left;
  //         if (right.type === ExpressionType.Number && right.value === 1)
  //           return right;

  //         if (left.type === ExpressionType.Number && left.value === 0)
  //           return right;
  //         if (right.type === ExpressionType.Number && right.value === 0)
  //           return left;

  //         if (JSON.stringify(left) === JSON.stringify(right)) return left;
  //       }

  //       if (expr.operator === Operators.And) {
  //         if (left.type === ExpressionType.Number && left.value === 0)
  //           return left;
  //         if (right.type === ExpressionType.Number && right.value === 0)
  //           return right;

  //         if (left.type === ExpressionType.Number && left.value === 1)
  //           return right;
  //         if (right.type === ExpressionType.Number && right.value === 1)
  //           return left;

  //         if (JSON.stringify(left) === JSON.stringify(right)) return left;
  //       }

  //       return { ...expr, left, right };
  //     }

  //     return expr;
  //   }

//   private simplifyNot(expr: Expression): Expression {
//     if (
//       expr.type === ExpressionType.UnaryExpression &&
//       expr.operator === Operators.Not
//     ) {
//       const subExpr = expr.operand;
//       if (
//         subExpr.type === ExpressionType.UnaryExpression &&
//         subExpr.operator === Operators.Not
//       ) {
//         return this.simplifyNot(subExpr.operand);
//       } else if (subExpr.type === ExpressionType.BinaryExpression) {
//         const regroupeCases: Omit<
//           Record<Operators, Operators>,
//           Operators.Not
//         > = {
//           [Operators.And]: Operators.Nand,
//           [Operators.Or]: Operators.Nor,
//           [Operators.Xor]: Operators.Xnor,
//           [Operators.Imply]: Operators.Nimply,
//           [Operators.Equal]: Operators.Nequal,

//           [Operators.Nand]: Operators.And,
//           [Operators.Nor]: Operators.Or,
//           [Operators.Xnor]: Operators.Xor,
//           [Operators.Nimply]: Operators.Imply,
//           [Operators.Nequal]: Operators.Equal,
//         };

//         if (subExpr.operator in regroupeCases) {
//           return {
//             id: subExpr.id,
//             type: ExpressionType.BinaryExpression,
//             left: this.simplifyNot(subExpr.left),
//             operator:
//               regroupeCases[subExpr.operator as keyof typeof regroupeCases],
//             right: this.simplifyNot(subExpr.right),
//           };
//         }
//       }
//     }
//     return expr;
//   }
}

export { SemanticWarningAnalyser, SemanticWarning, SemanticWarningType };
