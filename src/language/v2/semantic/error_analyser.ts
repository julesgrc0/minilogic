import { Keywords } from "../lexer";
import {
  Expression,
  ExpressionType,
  Statement,
  StatementType,
} from "../parser";

enum SemanticErrorType {
  VariableNotDefined,
  VariableReferenceNotDefined,
  VariableReference,
  VariableParameterNotDefined,

  VariableAlreadyDeclared,
  VariableAmbiguousName,

  FunctionAlreadyDeclared,
  FunctionAmbiguousName,
  FunctionDuplicateParameters,
  FunctionDuplicateSubParameters,

  FunctionTableInvalidLength,
  FunctionTableDuplicateIndexes,

  BuiltinInvalidUsage,
  BuiltinInvalidParameterLength,
  BuiltinInvalidParameterType,

  StringInExpression,
  Error,
}

type SemanticError = {
  type: SemanticErrorType;
  message: string;
  object: Statement | Expression;
  target?: Statement | Expression;
};

class SemanticErrorAnalyzer {
  private variables: Set<string> = new Set();
  private functions: Set<string> = new Set();

  private errors: SemanticError[] = [];
  private messages: Record<SemanticErrorType, string> = {
    [SemanticErrorType.VariableNotDefined]: "Variable {0} not defined",
    [SemanticErrorType.VariableReferenceNotDefined]:
      "Variable {0}* not defined",
    [SemanticErrorType.VariableReference]: "Unexpected variable reference {0}*",
    [SemanticErrorType.VariableParameterNotDefined]:
      "Parameter {0} not defined",
    [SemanticErrorType.VariableAlreadyDeclared]:
      "Variable {0} already declared",
    [SemanticErrorType.VariableAmbiguousName]:
      "Ambiguous variable name {0} already used as a function",
    [SemanticErrorType.FunctionAlreadyDeclared]:
      "Function {0} already declared",
    [SemanticErrorType.FunctionAmbiguousName]:
      "Ambiguous function name {0} already used as a variable",
    [SemanticErrorType.FunctionDuplicateParameters]:
      "Duplicate parameter names in function {0}",
    [SemanticErrorType.FunctionDuplicateSubParameters]:
      "Duplicate subparameter names in function {0}",
    [SemanticErrorType.FunctionTableInvalidLength]:
      "Function {0} table length mismatch. Expected {1}, got {2}",
    [SemanticErrorType.FunctionTableDuplicateIndexes]:
      "Duplicate index {0} in function table {1}",
    [SemanticErrorType.BuiltinInvalidUsage]: "Invalid usage of builtin {0}",
    [SemanticErrorType.BuiltinInvalidParameterLength]:
      "Invalid number of parameters for builtin {0}. Expected {1}, got {2}",
    [SemanticErrorType.BuiltinInvalidParameterType]:
      "Invalid parameter type for builtin {0}, expected {1}",
    [SemanticErrorType.StringInExpression]:
      "Invalid usage of string {0} in expression",
    [SemanticErrorType.Error]: "",
  };

  public constructor(private program: Statement[]) {}

  public analyze(): SemanticError[] {
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
        case StatementType.Error:
          this.pushError(SemanticErrorType.Error, null, stmt);
          break;
      }
    }

    return this.errors;
  }

  private pushError(
    type: SemanticErrorType,
    replace: string[] | null,
    object: Statement | Expression,
    target: Statement | Expression | undefined = undefined
  ): void {
    let message = this.messages[type];

    if (replace) {
      replace.forEach((r, i) => {
        message = message.replace(`{${i}}`, r);
      });
    }

    this.errors.push({
      type,
      message,
      object,
      target
    });
  }

  private checkVariableStatement(stmt: Statement) {
    if (stmt.type !== StatementType.Variable) return;

    let error = false;
    if (this.variables.has(stmt.name)) {
      error = true;
      this.pushError(
        SemanticErrorType.VariableAlreadyDeclared,
        [stmt.name],
        stmt
      );
    }

    if (this.functions.has(stmt.name)) {
      error = true;
      this.pushError(
        SemanticErrorType.VariableAmbiguousName,
        [stmt.name],
        stmt
      );
    }

    if (!error) {
      this.variables.add(stmt.name);
    }

    this.checkExpression(stmt, stmt.value);
  }

  private checkFunctionStatement(stmt: Statement) {
    if (stmt.type !== StatementType.Function) return;

    let error = false;
    if (this.functions.has(stmt.name)) {
      error = true;
      this.pushError(
        SemanticErrorType.FunctionAlreadyDeclared,
        [stmt.name],
        stmt
      );
    }

    if (this.variables.has(stmt.name)) {
      error = true;
      this.pushError(
        SemanticErrorType.FunctionAmbiguousName,
        [stmt.name],
        stmt
      );
    }

    const hasDuplicateParams = stmt.parameters.some(
      (param, index) => stmt.parameters.indexOf(param) !== index
    );
    if (hasDuplicateParams) {
      error = true;
      this.pushError(
        SemanticErrorType.FunctionDuplicateParameters,
        [stmt.name],
        stmt
      );
    }

    if (!error) {
      this.functions.add(stmt.name);
    }

    this.checkExpression(stmt, stmt.body, stmt.parameters);
  }

  private checkFunctionTableStatement(stmt: Statement) {
    if (stmt.type !== StatementType.FunctionTable) return;

    let error = false;
    if (this.functions.has(stmt.name)) {
      error = true;
      this.pushError(
        SemanticErrorType.FunctionAlreadyDeclared,
        [stmt.name],
        stmt
      );
    }

    if (this.variables.has(stmt.name)) {
      error = true;
      this.pushError(
        SemanticErrorType.FunctionAmbiguousName,
        [stmt.name],
        stmt
      );
    }

    const hasDuplicateParams = stmt.parameters.some(
      (param, index) => stmt.parameters.indexOf(param) !== index
    );
    if (hasDuplicateParams) {
      error = true;
      this.pushError(
        SemanticErrorType.FunctionDuplicateParameters,
        [stmt.name],
        stmt
      );
    }

    const hasDuplicateSubParams = stmt.subparameters.some(
      (param, index) => stmt.subparameters.indexOf(param) !== index
    );
    if (hasDuplicateSubParams) {
      error = true;
      this.pushError(
        SemanticErrorType.FunctionDuplicateSubParameters,
        [stmt.name],
        stmt
      );
    }

    const expectedLength = Math.pow(stmt.parameters.length, 2);
    if (stmt.table.length !== expectedLength) {
      error = true;
      this.pushError(
        SemanticErrorType.FunctionTableInvalidLength,
        [stmt.name, expectedLength.toString(), stmt.table.length.toString()],
        stmt
      );
    }

    const indexes = new Set<string>();
    for (const row of stmt.table) {
      const index = row.index.join("");
      if (indexes.has(index)) {
        error = true;
        this.pushError(
          SemanticErrorType.FunctionTableDuplicateIndexes,
          [index, stmt.name],
          stmt
        );
      }

      this.checkExpression(stmt, row.value, stmt.subparameters);
    }

    if (!error) {
      this.functions.add(stmt.name);
    }
  }

  private checkBuiltinCallStatement(stmt: Statement) {
    if (stmt.type !== StatementType.BuiltinCall) return;

    const invalidBuiltins = [
      Keywords.ToNand,
      Keywords.ToNor,
      Keywords.SolvePOS,
      Keywords.SolveSOP,
    ];
    if (invalidBuiltins.includes(stmt.name)) {
      this.pushError(SemanticErrorType.BuiltinInvalidUsage, [stmt.name], stmt);
      return;
    }

    switch (stmt.name) {
      case Keywords.Import:
        if (stmt.parameters.length !== 1) {
          this.pushError(
            SemanticErrorType.BuiltinInvalidParameterLength,
            [stmt.name, "1", stmt.parameters.length.toString()],
            stmt
          );
          return;
        }

        if (stmt.parameters[0].type !== ExpressionType.String) {
          this.pushError(
            SemanticErrorType.BuiltinInvalidParameterType,
            [stmt.name, "string"],
            stmt
          );
        }
        break;
      case Keywords.Export:
        if (stmt.parameters.length !== 2) {
          this.pushError(
            SemanticErrorType.BuiltinInvalidParameterLength,
            [stmt.name, "2", stmt.parameters.length.toString()],
            stmt
          );
          return;
        }
        if (stmt.parameters[0].type !== ExpressionType.String) {
          this.pushError(
            SemanticErrorType.BuiltinInvalidParameterType,
            [stmt.name, "string"],
            stmt
          );
        }
        this.checkExpression(stmt, stmt.parameters[1], [], stmt.name);
        break;
      default:
        {
          for (const param of stmt.parameters) {
            this.checkExpression(stmt, param, [], stmt.name);
          }
        }
        break;
    }
  }

  private checkExpression(
    parent: Statement,
    expr: Expression,
    parameters: string[] = [],
    builtin: Keywords | undefined = undefined
  ) {
    switch (expr.type) {
      case ExpressionType.Variable:
        this.checkVariableExpression(parent, expr, parameters, builtin);
        break;
      case ExpressionType.FunctionCall:
        this.checkFunctionCallExpression(parent, expr, parameters, builtin);
        break;
      case ExpressionType.BuiltinCall:
        this.checkBuiltinCallExpression(parent, expr, parameters, expr.name);
        break;
      case ExpressionType.Number:
        this.checkNumberExpression(expr, builtin);
        break;
      case ExpressionType.String:
        this.checkStringExpression(expr, builtin);
        break;
      case ExpressionType.Binary:
        this.checkExpression(parent, expr.left, parameters, builtin);
        this.checkExpression(parent, expr.right, parameters, builtin);
        break;
      case ExpressionType.Unary:
        this.checkExpression(parent, expr.operand, parameters, builtin);
        break;
      case ExpressionType.Error:
        this.pushError(SemanticErrorType.Error, null, expr);
        break;
    }
  }

  private checkVariableExpression(
    parent: Statement,
    expr: Expression,
    parameters: string[],
    builtin: Keywords | undefined
  ) {
    if (expr.type !== ExpressionType.Variable) return;

    const isFunction = parameters.length > 0;
    const isBuiltin = builtin !== undefined;

    if (isFunction) {
      if (expr.reference && !this.variables.has(expr.name)) {
        this.pushError(
          SemanticErrorType.VariableReferenceNotDefined,
          [expr.name],
          expr
        );
      }

      if (!expr.reference && !parameters.includes(expr.name)) {
        this.pushError(
          SemanticErrorType.VariableParameterNotDefined,
          [expr.name],
          parent,
          expr
        );
      }
      return;
    }

    if (isBuiltin) {
      const validBuiltins = [
        Keywords.Show,
        Keywords.Table,
        Keywords.Graph,
        Keywords.Export,
      ];

      if (validBuiltins.includes(builtin)) {
        if (expr.reference) {
          this.pushError(
            SemanticErrorType.VariableReference,
            [expr.name],
            expr
          );
        }
        return;
      }
    }

    if (!this.variables.has(expr.name)) {
      this.pushError(SemanticErrorType.VariableNotDefined, [expr.name], expr);
    }

    if (expr.reference) {
      this.pushError(SemanticErrorType.VariableReference, [expr.name], expr);
    }
  }

  private checkFunctionCallExpression(
    parent: Statement,
    expr: Expression,
    parameters: string[],
    builtin: Keywords | undefined
  ) {
    if (expr.type !== ExpressionType.FunctionCall) return;

    if (!this.functions.has(expr.name)) {
      this.pushError(
        SemanticErrorType.FunctionAlreadyDeclared,
        [expr.name],
        expr
      );
    }

    for (const param of expr.parameters) {
      this.checkExpression(parent, param, parameters, builtin);
    }
  }

  private checkBuiltinCallExpression(
    parent: Statement,
    expr: Expression,
    parameters: string[],
    builtin: Keywords | undefined
  ) {
    if (expr.type !== ExpressionType.BuiltinCall || builtin === undefined) {
      return;
    }

    const validBuiltins = [
      Keywords.ToNand,
      Keywords.ToNor,
      Keywords.SolvePOS,
      Keywords.SolveSOP,
    ];
    if (!validBuiltins.includes(builtin)) {
      this.pushError(SemanticErrorType.BuiltinInvalidUsage, [builtin], expr);
      return;
    }

    if (expr.parameters.length !== 1) {
      this.pushError(
        SemanticErrorType.BuiltinInvalidParameterLength,
        [builtin, "1", expr.parameters.length.toString()],
        expr
      );
      return;
    }

    this.checkExpression(parent, expr.parameters[0], parameters, builtin);
  }

  private checkNumberExpression(
    expr: Expression,
    builtin: Keywords | undefined
  ) {
    if (expr.type !== ExpressionType.Number) return;

    if (builtin == Keywords.Table) {
      this.pushError(
        SemanticErrorType.BuiltinInvalidParameterType,
        [builtin, "number"],
        expr
      );
    }
  }

  private checkStringExpression(
    expr: Expression,
    builtin: Keywords | undefined
  ) {
    if (expr.type !== ExpressionType.String) return;

    const validBuiltins = [Keywords.Import, Keywords.Export, Keywords.Print];

    if (builtin == undefined) {
      this.pushError(SemanticErrorType.StringInExpression, [expr.value], expr);
    } else if (!validBuiltins.includes(builtin)) {
      {
        this.pushError(
          SemanticErrorType.BuiltinInvalidParameterType,
          [builtin, "string"],
          expr
        );
      }
    }
  }
}

export { SemanticErrorAnalyzer, SemanticError, SemanticErrorType };
