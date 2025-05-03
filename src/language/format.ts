import { Operators } from "./lexer";
import { Expression, ExpressionType, Statement, StatementType } from "./parser";

class Format {
  public static format(statements: Statement[]): string {
    let lastStmtType: StatementType | null = null;
    let output = "";

    for (const stmt of statements) {
      if (lastStmtType && lastStmtType !== stmt.type) {
        output += "\n";
      }
      output += this.formatStatement(stmt) + "\n";

      lastStmtType = stmt.type;
    }

    return output;
  }

  public static formatStatement(stmt: Statement): string {
    switch (stmt.type) {
      case StatementType.Variable:
        return `${stmt.name} = ${this.formatExpression(stmt.value)}`;
      case StatementType.Function:
        return `${stmt.name}(${stmt.parameters.join(
          ", "
        )}) = ${this.formatExpression(stmt.body)}`;
      case StatementType.FunctionTable:
        return `${stmt.name}(${stmt.parameters.join(
          ", "
        )}) = [\n${stmt.table.map((row) => {
          return `${row.index.value.join("")}, ${this.formatExpression(row.value)}\n`;
        })}]`;
      case StatementType.BuiltinCall:
        return `${stmt.name}(${stmt.parameters
          .map((param) => this.formatExpression(param))
          .join(", ")})`;
      case StatementType.Comment:
        return `// ${stmt.value}`;
      default:
        throw new Error(`Unknown statement type: ${stmt.type}`);
    }
  }

  public static formatExpression(expr: Expression): string {
    switch (expr.type) {
      case ExpressionType.Number:
        return expr.value.toString();
      case ExpressionType.String:
        return `"${expr.value}"`;
      case ExpressionType.Binary:
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
      case ExpressionType.Unary:
        if (expr.operator === Operators.Not) {
          return `not ${this.formatExpression(expr.operand)}`;
        }
        return `(${expr.operator} ${this.formatExpression(expr.operand)})`;
      case ExpressionType.BuiltinCall:
      case ExpressionType.FunctionCall:
        return `${expr.name}(${expr.parameters
          .map((param) => this.formatExpression(param))
          .join(", ")})`;
      case ExpressionType.Variable:
        return expr.name;
      default:
        throw new Error(`Unknown expression type: ${expr.type}`);
    }
  }
}

export { Format };