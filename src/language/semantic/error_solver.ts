import { Format } from "../format";
import { CodeFix, Keywords, Operators, TokenType } from "../lexer";
import {
  Expression,
  ExpressionType,
  FunctionTableBody,
  isExpression,
  isStatement,
  Statement,
  StatementType,
} from "../parser";
import { getCombinations, levenshteinDistance, RANGE_NOT_SET } from "../utils";
import { SemanticError, SemanticErrorType } from "./error_analyser";

class SemanticErrorSolver {
  private fixes: CodeFix[] = [];

  public constructor(
    private errors: SemanticError[],
    private variables: string[],
    private functions: string[],
  ) {}

  public solve() {
    for (const error of this.errors) {
      switch (error.type) {
        case SemanticErrorType.VariableCalledBeforeDeclaration:
          this.moveVariableDeclaration(error);
          break;
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
        case SemanticErrorType.FunctionNotDefined:
          this.createNewFunction(error);
          break;
        case SemanticErrorType.FunctionCalledBeforeDeclaration:
          this.moveFunctionDeclaration(error);
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
        case SemanticErrorType.BuiltinInvalidParameterType:
        case SemanticErrorType.BuiltinInvalidParameterLength:
          // TODO: Add builtin fixes
          break;
        case SemanticErrorType.StringInExpression:
          this.removeStringInExpression(error);
          break;
        case SemanticErrorType.Error:
          this.removeError(error);
          break;
        case SemanticErrorType.VariableNotDefinedOrCalledBeforeDeclaration:
        case SemanticErrorType.FunctionNotDefinedOrCalledBeforeDeclaration:
          console.error("THIS ERROR SHOULD NOT HAPPEN");
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
    ) {
      return;
    }

    const expr = error.object as Expression;
    if (expr.type !== ExpressionType.Variable) return;

    const possible_name = this.nearbyName(expr.name, this.variables);
    if (possible_name && possible_name !== expr.name) {
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

  private moveVariableDeclaration(error: SemanticError) {
    if (error.type !== SemanticErrorType.VariableCalledBeforeDeclaration)
      return;
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

  private createNewFunction(error: SemanticError) {
    if (error.type !== SemanticErrorType.FunctionNotDefined) return;
  }

  private moveFunctionDeclaration(error: SemanticError) {
    if (error.type !== SemanticErrorType.FunctionCalledBeforeDeclaration)
      return;
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
    } else if (stmt.type === StatementType.FunctionTable) {
      const new_subparameters = [...new Set(stmt.subparameters)];
      const new_parameters = [...new Set(stmt.parameters)];
      this.fixes.push({
        start: stmt.range.start,
        end:
          stmt.table.length > 0
            ? stmt.table[0].value.range.start
            : stmt.range.end,
        message: `Remove duplicate parameters from function ${stmt.name}`,
        value: `${stmt.name}(${new_parameters}${
          new_subparameters.length > 0 ? "|" + new_subparameters.join(", ") : ""
        }) = [`,
      });
    }
  }

  private createFunctionTable(error: SemanticError) {
    if (
      error.type !== SemanticErrorType.FunctionTableInvalidLength ||
      isExpression(error.object)
    )
      return;

    const stmt = error.object as Statement;
    if (stmt.type !== StatementType.FunctionTable) return;

    const cmbs = getCombinations(stmt.parameters.length);
    const new_table: FunctionTableBody = cmbs.map((cmb) => {
      const value = stmt.table
        .map((row) => {
          if (row.index.value.join("") === cmb.join("")) {
            return row.value;
          }
        })
        .filter((v) => v !== undefined);

      return {
        index: { value: cmb, range: RANGE_NOT_SET },
        value:
          value.length > 0
            ? value[0]
            : {
                type: ExpressionType.Number,
                value: 0,
                range: RANGE_NOT_SET,
              },
      };
    });

    this.fixes.push({
      start: stmt.range.start,
      end: stmt.range.end,
      message: `Create function table for ${stmt.name}`,
      value: Format.formatStatement({
        ...stmt,
        table: new_table,
      }),
    });
  }

  private removeDuplicateIndexes(error: SemanticError) {
    if (
      error.type !== SemanticErrorType.FunctionTableDuplicateIndexes ||
      isExpression(error.object)
    )
      return;

    const stmt = error.object as Statement;
    if (stmt.type !== StatementType.FunctionTable) return;

    const new_table = stmt.table.filter((row, index, self) => {
      return (
        index ===
        self.findIndex(
          (r) => r.index.value.join("") === row.index.value.join(""),
        )
      );
    });

    this.fixes.push({
      start: stmt.range.start,
      end: stmt.range.end,
      message: `Remove duplicate indexes from function table ${stmt.name}`,
      value: Format.formatStatement({
        ...stmt,
        table: new_table,
      }),
    });
  }

  private removeStringInExpression(error: SemanticError) {
    if (error.type !== SemanticErrorType.StringInExpression) return;

    const expr = error.object as Expression;
    if (expr.type !== ExpressionType.String) return;

    this.fixes.push({
      start: expr.range.start,
      end: expr.range.end,
      message: `Remove string ${expr.value} from expression`,
      value: null,
    });
  }

  private removeError(error: SemanticError) {
    if (error.type !== SemanticErrorType.Error) return;

    const stmt = error.object as Statement;
    if (stmt.type !== StatementType.Error) return;

    if (stmt.expected === null) {
      this.fixes.push({
        start: stmt.range.start,
        end: stmt.range.end,
        message: `Remove token ${stmt.token.value}`,
        value: null,
      });
    } else {
      this.fixes.push({
        start: stmt.range.start,
        end: stmt.range.end,
        message: `Replace token ${stmt.token.value} with ${stmt.expected}`,
        value: this.getExpectedTokenType(stmt.expected),
      });
    }
  }

  private getExpectedTokenType(type: TokenType): string {
    switch (type) {
      case TokenType.Identifier:
        return "A";
      case TokenType.Operator:
        return Operators.And;
      case TokenType.Keyword:
        return Keywords.Print;
      case TokenType.BinaryNumber:
        return "0";
      case TokenType.BinaryNumberList:
        return "00";
      case TokenType.String:
        return "Hello World!";
      case TokenType.Equal:
        return "=";
      case TokenType.Star:
        return "*";
      case TokenType.Comma:
        return ",";
      case TokenType.Bar:
        return "|";
      case TokenType.LParen:
        return "(";
      case TokenType.RParen:
        return ")";
      case TokenType.LBracket:
        return "[";
      case TokenType.RBracket:
        return "]";
      case TokenType.Comment:
        return "// Comment";
      default:
        return "";
    }
  }
}

export { SemanticErrorSolver };
