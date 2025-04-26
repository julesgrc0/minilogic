import { CodeFix } from "../lexer";
import {
  Expression,
  ExpressionType,
  isExpression,
  isStatement,
  Statement,
  StatementType,
} from "../parser";
import { levenshteinDistance } from "../utils";
import { SemanticError, SemanticErrorType } from "./error_analyser";

class SemanticErrorSolver {
  private fixes: CodeFix[] = [];

  public constructor(
    private errors: SemanticError[],
    private variables: string[],
    private functions: string[]
  ) {}

  public solve() {
    for (const error of this.errors) {
      switch (error.type) {
        case SemanticErrorType.VariableNotDefined:
        case SemanticErrorType.VariableReferenceNotDefined:
          this.createNewVariable(error);
          break;
        case SemanticErrorType.VariableReference:
          this.removeVariableReference(error);
          break;
        case SemanticErrorType.VariableParameterNotDefined:
          this.createFunctionParameter(error);
          break;
        case SemanticErrorType.VariableAlreadyDeclared:
        case SemanticErrorType.FunctionAlreadyDeclared:
        case SemanticErrorType.VariableAmbiguousName:
        case SemanticErrorType.FunctionAmbiguousName:
          this.renameObject(error);
          break;
        case SemanticErrorType.FunctionDuplicateParameters:
        case SemanticErrorType.FunctionDuplicateSubParameters:
          this.removeDuplicateParameters(error);
          break;
        case SemanticErrorType.FunctionTableInvalidLength:
          this.createFunctionTable(error);
          break;
        case SemanticErrorType.FunctionTableDuplicateIndexes:
          this.removeDuplicateIndexes(error);
          break;
        case SemanticErrorType.BuiltinInvalidUsage:
          // TODO
          break;
        case SemanticErrorType.BuiltinInvalidParameterType:
        case SemanticErrorType.BuiltinInvalidParameterLength:
          this.solveInvalidBuiltinParameter(error);
          break;
        case SemanticErrorType.StringInExpression:
          this.removeStringInExpression(error);
          break;
        case SemanticErrorType.Error:
          this.removeError(error);
          break;
      }
    }
    return this.fixes;
  }

  private proposeName(base: string | null) {
    const basename = base || "var";

    let i = 1;
    let name = basename;
    while (this.variables.includes(name) || this.functions.includes(name)) {
      name = `${basename}${i}`;
      i++;
    }
    return name;
  }

  private nearbyName(base: string, list: string[]): string | null {
    let minDistance = Infinity;
    let closestName = base;

    for (const name of list) {
      const distance = levenshteinDistance(base, name);
      if (distance < minDistance) {
        minDistance = distance;
        closestName = name;
      }
    }

    if (minDistance > 2) return null;

    return closestName;
  }

  private createNewVariable(error: SemanticError) {
    if (
      ![
        SemanticErrorType.VariableNotDefined,
        SemanticErrorType.VariableReferenceNotDefined,
      ].includes(error.type) ||
      isStatement(error.object)
    )
      return;

    const expr = error.object as Expression;
    if (expr.type !== ExpressionType.Variable) return;

    const possible_name = this.nearbyName(expr.name, this.variables);
    if (possible_name) {
      this.fixes.push({
        start: expr.range.start,
        end: expr.range.end,
        message: `Use variable ${possible_name} instead of ${expr.name}`,
        value: `${possible_name}${expr.reference ? "*" : ""}`,
      });

      return;
    }

    const new_name = this.proposeName(expr.name);
    this.fixes.push({
      start: { line: 0, column: 0, offset: 0 },
      end: { line: 0, column: 0, offset: 0 },
      message: `Create new variable ${expr.name}`,
      value: `${new_name} = 0\n`,
    });
  }

  private removeVariableReference(error: SemanticError) {
    if (
      error.type !== SemanticErrorType.VariableReference ||
      isStatement(error.object)
    )
      return;

    const expr = error.object as Expression;
    if (expr.type !== ExpressionType.Variable) return;

    this.fixes.push({
      start: expr.range.start,
      end: expr.range.end,
      message: `Remove reference ${expr.name}* to variable ${expr.name}`,
      value: expr.name,
    });
  }

  private createFunctionParameter(error: SemanticError) {
    if (
      error.type !== SemanticErrorType.VariableParameterNotDefined ||
      isExpression(error.object) ||
      error.target == undefined ||
      isStatement(error.target)
    )
      return;

    const stmt = error.object as Statement;
    const expr = error.target as Expression;

    if (
      stmt.type !== StatementType.Function ||
      expr.type != ExpressionType.Variable
    )
      return;

    const possible_name = this.nearbyName(expr.name, stmt.parameters);
    if (possible_name) {
      this.fixes.push({
        start: expr.range.start,
        end: expr.range.end,
        message: `Use parameter ${possible_name} instead of ${expr.name}`,
        value: `${stmt.name}(${stmt.parameters.join(", ")}) = `,
      });
      return;
    }

    const new_parameters = [...stmt.parameters, expr.name];
    this.fixes.push({
      start: stmt.range.start,
      end: stmt.body.range.start,
      message: `Add parameter ${expr.name} to function ${stmt.name}`,
      value: `${stmt.name}(${new_parameters.join(", ")}) = `,
    });
  }

  private renameObject(error: SemanticError) {
    if (
      ![
        SemanticErrorType.VariableAlreadyDeclared,
        SemanticErrorType.FunctionAlreadyDeclared,
        SemanticErrorType.VariableAmbiguousName,
        SemanticErrorType.FunctionAmbiguousName,
      ].includes(error.type) ||
      isExpression(error.object)
    )
      return;

    const stmt = error.object as Statement;
    if (
      stmt.type !== StatementType.Variable &&
      stmt.type !== StatementType.Function &&
      stmt.type !== StatementType.FunctionTable
    )
      return;

    const new_name = this.proposeName(stmt.name);

    let value;
    if (stmt.type === StatementType.FunctionTable) {
      const subparam =
        stmt.subparameters.length > 0
          ? "|" + stmt.subparameters.join(", ")
          : "";
      value = `${stmt.name}(${stmt.parameters.join(", ")}${subparam}) = [`;
    } else if (stmt.type === StatementType.Function) {
      value = `${stmt.name}(${stmt.parameters.join(", ")}) = `;
    } else {
      value = `${stmt.name} = `;
    }

    this.fixes.push({
      start: stmt.range.start,
      end: stmt.range.end,
      message: `Rename ${stmt.name} to ${new_name}`,
      value,
    });
  }

  private removeDuplicateParameters(error: SemanticError) {
    if (
      ![
        SemanticErrorType.FunctionDuplicateParameters,
        SemanticErrorType.FunctionDuplicateSubParameters,
      ].includes(error.type) ||
      isExpression(error.object)
    )
      return;

    const stmt = error.object as Statement;
    if (stmt.type === StatementType.Function) {
      const new_parameters = [...new Set(stmt.parameters)];
      this.fixes.push({
        start: stmt.range.start,
        end: stmt.body.range.start,
        message: `Remove duplicate parameters from function ${stmt.name}`,
        value: `${stmt.name}(${new_parameters.join(", ")}) = `,
      });
      return;
    }
    else if(stmt.type === StatementType.FunctionTable) {
      const new_subparameters = [...new Set(stmt.subparameters)];
      const new_parameters = [...new Set(stmt.parameters)];
      this.fixes.push({
        start: stmt.range.start,
        end: stmt.table.length > 0 ? stmt.table[0].value.range.start : stmt.range.end,
        message: `Remove duplicate parameters from function ${stmt.name}`,
        value: `${stmt.name}(${new_parameters}${new_subparameters.length > 0 ? "|" + new_subparameters.join(", ") : ""}) = [`,
      });
    }
  }

}
