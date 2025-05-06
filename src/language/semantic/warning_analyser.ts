import { Keywords, Operators } from "../lexer";
import {
  Expression,
  ExpressionType,
  Statement,
  StatementType,
} from "../parser";
import { expressionEqual } from "../utils";

enum SemanticWarningType {
  ExpressionOptimized,
  VariableUnused,
  FunctionUnused,
  FunctionUnusedParameter,
  FunctionToVariable,
}

type SemanticWarning = {
  type: SemanticWarningType;
  message: string;

  object: Statement | Expression;
  new_object?: Statement | Expression;
};

class SemanticWarningAnalyzer {
  private variables: Record<string, { stmt: Statement; count: number }> = {};
  private functions: Record<string, { stmt: Statement; count: number }> = {};

  private warnings: SemanticWarning[] = [];
  private messages: Record<SemanticWarningType, string> = {
    [SemanticWarningType.ExpressionOptimized]: "Expression can be optimized",
    [SemanticWarningType.VariableUnused]: "Variable {0} is unused",
    [SemanticWarningType.FunctionUnused]: "Function {0} is unused",
    [SemanticWarningType.FunctionUnusedParameter]:
      "Function {0} has {1} unused parameters ({2})",
    [SemanticWarningType.FunctionToVariable]:
      "Function {0} can be converted to a variable",
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
          this.variables[variable].stmt,
        );
      }
    }

    for (const func of Object.keys(this.functions)) {
      if (this.functions[func].count == 0) {
        this.pushWarning(
          SemanticWarningType.FunctionUnused,
          [func],
          this.functions[func].stmt,
        );
      }
    }

    return this.warnings;
  }

  private pushWarning(
    type: SemanticWarningType,
    replace: string[] | null,
    object: Statement | Expression,
    new_object: Statement | Expression | undefined = undefined,
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
    if (new_object !== null && !expressionEqual(new_object, stmt.value)) {
      this.pushWarning(SemanticWarningType.ExpressionOptimized, null, stmt, {
        ...stmt,
        value: new_object,
      });
    }
  }

  private checkFunctionStatement(stmt: Statement) {
    if (stmt.type !== StatementType.Function) return;

    if (this.functions.hasOwnProperty(stmt.name)) {
      this.functions[stmt.name] = { stmt, count: 0 };
    }
    this.updateExpressionCount(stmt.body, true);

    const unused = this.findUnusedFunctionParameters(stmt.parameters, [
      stmt.body,
    ]);
    if (unused.length > 0) {
      this.pushWarning(
        SemanticWarningType.FunctionUnusedParameter,
        [stmt.name, unused.length.toString(), unused.join(", ")],
        stmt,
        {
          ...stmt,
          parameters: stmt.parameters.filter((p) => !unused.includes(p)),
        },
      );
    }

    let new_object = this.removeDeadExpression(stmt.body);
    if (new_object !== null && !expressionEqual(new_object, stmt.body)) {
      this.pushWarning(
        SemanticWarningType.ExpressionOptimized,
        null,
        stmt,
        new_object,
      );
    }

    if (stmt.body.type == ExpressionType.Number) {
      this.pushWarning(SemanticWarningType.FunctionToVariable, null, stmt, {
        ...stmt,
        type: StatementType.Variable,
        value: stmt.body,
      });
    }
  }

  private checkFunctionTableStatement(stmt: Statement) {
    if (stmt.type !== StatementType.FunctionTable) return;

    if (this.functions.hasOwnProperty(stmt.name)) {
      this.functions[stmt.name] = { stmt, count: 0 };
    }

    const unused = this.findUnusedFunctionParameters(
      stmt.subparameters,
      stmt.table.map((e) => e.value),
    );
    if (unused.length > 0) {
      this.pushWarning(
        SemanticWarningType.FunctionUnusedParameter,
        [stmt.name, unused.length.toString(), unused.join(", ")],
        stmt,
        {
          ...stmt,
          parameters: stmt.parameters.filter((p) => !unused.includes(p)),
        },
      );
    }

    for (const expr of stmt.table) {
      this.updateExpressionCount(expr.value, true);

      let new_object = this.removeDeadExpression(expr.value);
      if (new_object !== null && !expressionEqual(new_object, expr.value)) {
        this.pushWarning(
          SemanticWarningType.ExpressionOptimized,
          null,
          stmt,
          new_object,
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
    needReference: boolean = false,
  ) {
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
        expr.parameters.forEach((param) =>
          this.updateExpressionCount(param, true),
        );
        break;
      case ExpressionType.Binary:
        this.updateExpressionCount(expr.left, needReference);
        this.updateExpressionCount(expr.right, needReference);
        break;
      case ExpressionType.Unary:
        this.updateExpressionCount(expr.operand, needReference);
        break;
    }
  }

  private removeDeadExpression(expr: Expression): Expression | null {
    if (expr.type === ExpressionType.Binary) {
      const left = this.removeDeadExpression(expr.left) ?? expr.left;
      const right = this.removeDeadExpression(expr.right) ?? expr.right;

      if (expr.operator === Operators.Or) {
        if (left.type === ExpressionType.Number && left.value === 1)
          return left;
        if (right.type === ExpressionType.Number && right.value === 1)
          return right;

        if (left.type === ExpressionType.Number && left.value === 0)
          return right;
        if (right.type === ExpressionType.Number && right.value === 0)
          return left;

        if (expressionEqual(left, right)) return left;
      }

      if (expr.operator === Operators.And) {
        if (left.type === ExpressionType.Number && left.value === 0)
          return left;
        if (right.type === ExpressionType.Number && right.value === 0)
          return right;

        if (left.type === ExpressionType.Number && left.value === 1)
          return right;
        if (right.type === ExpressionType.Number && right.value === 1)
          return left;

        if (expressionEqual(left, right)) return left;
      }

      return { ...expr, left, right };
    } else if (
      expr.type === ExpressionType.Unary &&
      expr.operator === Operators.Not
    ) {
      const subExpr = this.removeDeadExpression(expr.operand) ?? expr.operand;

      if (
        subExpr.type === ExpressionType.Unary &&
        subExpr.operator === Operators.Not
      ) {
        return this.removeDeadExpression(subExpr.operand);
      } else if (subExpr.type === ExpressionType.Binary) {
        const left = this.removeDeadExpression(subExpr.left) ?? subExpr.left;
        const right = this.removeDeadExpression(subExpr.right) ?? subExpr.right;

        const regroupeCases: Omit<
          Record<Operators, Operators>,
          Operators.Not
        > = {
          [Operators.And]: Operators.Nand,
          [Operators.Or]: Operators.Nor,
          [Operators.Xor]: Operators.Xnor,
          [Operators.Imply]: Operators.Nimply,

          [Operators.Nand]: Operators.And,
          [Operators.Nor]: Operators.Or,
          [Operators.Xnor]: Operators.Xor,
          [Operators.Nimply]: Operators.Imply,
        };

        if (subExpr.operator in regroupeCases) {
          return {
            ...subExpr,
            left,
            operator:
              regroupeCases[subExpr.operator as keyof typeof regroupeCases],
            right,
          };
        }
      }
    } else if (
      expr.type == ExpressionType.FunctionCall ||
      expr.type == ExpressionType.BuiltinCall
    ) {
      let new_params = expr.parameters.map((param) =>
        this.removeDeadExpression(param),
      );

      if (new_params.every((param) => param == null)) {
        return null;
      }

      return {
        ...expr,
        parameters: new_params.map((param, index) => {
          if (param == null) {
            return expr.parameters[index];
          }
          return param;
        }),
      };
    }

    return null;
  }

  private findUnusedFunctionParameters(
    parameters: string[],
    exprs: Expression[],
  ): string[] {
    const usedParams = new Set<string>();

    const checkExpression = (expr: Expression) => {
      if (expr.type === ExpressionType.Variable) {
        if (!expr.reference && !usedParams.has(expr.name)) {
          usedParams.add(expr.name);
        }
        return;
      }

      if (
        expr.type === ExpressionType.FunctionCall ||
        expr.type === ExpressionType.BuiltinCall
      ) {
        for (const param of expr.parameters) {
          checkExpression(param);
        }
      } else if (expr.type === ExpressionType.Binary) {
        checkExpression(expr.left);
        checkExpression(expr.right);
      } else if (expr.type === ExpressionType.Unary) {
        checkExpression(expr.operand);
      }
    };

    for (const expr of exprs) {
      checkExpression(expr);
    }

    return parameters.filter((param) => !usedParams.has(param));
  }
}

export { SemanticWarningAnalyzer, SemanticWarning, SemanticWarningType };
