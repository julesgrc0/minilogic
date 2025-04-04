import { Lexer, Operators } from "./lexer";
import {
  Statement,
  StatementType,
  Expression,
  ExpressionType,
  Parser,
} from "./parser";

class Formatter {
  private lastStmt: Statement | null = null;

  constructor(private ast: Statement[]) {}

  public format(): string {
    return this.ast.map((stmt) => this.formatStatement(stmt)).join("\n");
  }

  private formatStatement(stmt: Statement): string {
    const newLine = this.lastStmt?.type !== stmt.type ? '\n' : '';
    this.lastStmt = stmt;

    switch (stmt.type) {
      case StatementType.Assignment:
        return `${newLine}${stmt.variable} = ${this.formatExpression(stmt.expression)}`;
    case StatementType.FunctionDefinition:
        return `${newLine}${stmt.name}(${stmt.parameters.join(
          ", "
        )}) = ${this.formatExpression(stmt.expression)}`;
      case StatementType.BuiltinCall:
        return `${newLine}${stmt.name.toUpperCase()}(${stmt.args
          .map((arg) => this.formatExpression(arg))
          .join(", ")})`;
    }
  }

  private formatExpression(expr: Expression): string {
    switch (expr.type) {
      case ExpressionType.Number:
        return expr.value.toString();
      case ExpressionType.Variable:
        return expr.name + (expr.reference ? "*" : "");
      case ExpressionType.UnaryExpression:
        if (expr.operator === Operators.Not) {
          return `${expr.operator} ${this.formatExpression(expr.operand)}`;
        }
        return `${expr.operator}(${this.formatExpression(expr.operand)})`;

      case ExpressionType.BinaryExpression:
        if (
          expr.operator === Operators.And ||
          expr.operator === Operators.Nand
        ) {
          return `${this.formatExpression(expr.left)} ${
            expr.operator
          } ${this.formatExpression(expr.right)}`;
        }
        return `(${this.formatExpression(expr.left)} ${
          expr.operator
        } ${this.formatExpression(expr.right)})`;
      case ExpressionType.FunctionCall:
        return `${expr.name}(${expr.args
          .map((arg) => this.formatExpression(arg))
          .join(", ")})`;
      case ExpressionType.TableDefinition:
        return `[\n${expr.rows
          .map(
            (row) =>
              `  ${row.input[0].map((bit) => bit.value).join("")}, ${
                row.output[0]
              }`
          )
          .join("\n")}\n]`;
    }
  }
}

export { Formatter };