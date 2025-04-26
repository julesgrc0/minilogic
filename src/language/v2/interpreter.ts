import { BinaryNumber } from "./lexer";
import { Expression, ExpressionType, Statement, StatementType } from "./parser";

class Interpreter {
  private variables: Record<string, BinaryNumber> = {};
  private functions: Record<string, Statement> = {};
  private output: string[] = [];

  public constructor(private program: Statement[]) {}

  public execute(): string[] {
    for (const stmt of this.program) {
      switch (stmt.type) {
        case StatementType.Variable:
          this.variables[stmt.name] = this.evalExpression(stmt.value);
          break;
        case StatementType.FunctionTable:
        case StatementType.Function:
          this.functions[stmt.name] = stmt;
          break;
        case StatementType.BuiltinCall:
          this.evalBuiltinStatement(stmt);
          break;
      }
    }
    return this.output;
  }

  private evalExpression(expr: Expression): BinaryNumber {
    switch (expr.type) {
      case ExpressionType.Number:
        return expr.value;
      case ExpressionType.Variable:
        return this.evalVariable(expr);
      case ExpressionType.FunctionCall:
        return this.evalFunctionCall(expr);
      case ExpressionType.Binary:
        return this.evalBinaryExpression(expr);
      case ExpressionType.Unary:
        return this.evalUnaryExpression(expr);
      case ExpressionType.BuiltinCall:
        return this.evalBuiltinCall(expr);
      default:
        throw new Error("Unexpected expression type");
    }
  }
}
