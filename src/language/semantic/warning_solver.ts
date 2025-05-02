import { Format } from "../format";
import { CodeFix } from "../lexer";
import { isExpression, isStatement, StatementType } from "../parser";
import { SemanticWarning, SemanticWarningType } from "./warning_analyser";

class SemanticWarningSolver {
  private fixes: CodeFix[] = [];

  public constructor(private warnings: SemanticWarning[]) {}

  public solve() {
    for (const warning of this.warnings) {
      switch (warning.type) {
        case SemanticWarningType.ExpressionOptimized:
          this.optimizeExpression(warning);
          break;
        case SemanticWarningType.FunctionUnused:
        case SemanticWarningType.VariableUnused:
          this.removeObject(warning);
          break;
        case SemanticWarningType.FunctionUnusedParameter:
          this.removeParameter(warning);
          break;
        case SemanticWarningType.FunctionToVariable:
          this.functionToVariable(warning);
          break;
      }
    }
    return this.fixes;
  }

  private optimizeExpression(warning: SemanticWarning) {
    if (
      warning.type !== SemanticWarningType.ExpressionOptimized ||
      warning.new_object === undefined
    )
      return;

      const value = isStatement(warning.new_object)
      ? Format.formatStatement(warning.new_object)
      : Format.formatExpression(warning.new_object)
    this.fixes.push({
      start: warning.object.range.start,
      end: warning.object.range.end,
      message: `Optimize expression to : ${value}`,
      value: value,
    });
  }

  private removeObject(warning: SemanticWarning) {
    if (
      (warning.type !== SemanticWarningType.FunctionUnused &&
        warning.type !== SemanticWarningType.VariableUnused) ||
      isExpression(warning.object)
    )
      return;

    const stmt = warning.object;
    if (
      stmt.type !== StatementType.Variable &&
      stmt.type !== StatementType.Function
    )
      return;

    this.fixes.push({
      start: warning.object.range.start,
      end: warning.object.range.end,
      message: `Remove unused ${
        warning.type === SemanticWarningType.FunctionUnused
          ? "function"
          : "variable"
      } "${stmt.name}"`,
      value: null,
    });
  }

  private removeParameter(warning: SemanticWarning) {
    if (
      warning.type !== SemanticWarningType.FunctionUnusedParameter ||
      isExpression(warning.object) ||
      warning.new_object === undefined
    )
      return;

    const stmt = warning.new_object;
    if (stmt.type !== StatementType.Function) return;

    this.fixes.push({
      start: stmt.range.start,
      end: stmt.range.end,
      message: `Remove unused parameters from function "${stmt.name}"`,
      value: Format.formatStatement(stmt),
    });
  }

  private functionToVariable(warning: SemanticWarning) {
    if (
      warning.type !== SemanticWarningType.FunctionToVariable ||
      isExpression(warning.object) ||
      warning.new_object === undefined
    )
      return;

    const stmt = warning.new_object;
    if (stmt.type !== StatementType.Function) return;

    this.fixes.push({
      start: stmt.range.start,
      end: stmt.range.end,
      message: `Convert function "${stmt.name}" to variable`,
      value: Format.formatStatement(stmt),
    });
  }
}

export { SemanticWarningSolver };
