import { Keywords, Operators } from "../lexer";
import {
  Expression,
  ExpressionType,
  isStatement,
  Statement,
  StatementType,
} from "../parser";
import { findExpressionInStatements } from "../utils";

enum SemanticErrorType {
  VariableNotDefinedOrCalledBeforeDeclaration,
  VariableCalledBeforeDeclaration,
  VariableNotDefined,
  VariableReferenceNotDefined,
  VariableReference,
  VariableParameterNotDefined,

  VariableAlreadyDeclared,
  VariableAmbiguousName,

  FunctionAlreadyDeclared,
  FunctionNotDefinedOrCalledBeforeDeclaration,
  FunctionNotDefined,
  FunctionCalledBeforeDeclaration,
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
    [SemanticErrorType.VariableNotDefinedOrCalledBeforeDeclaration]: "{0}",
    [SemanticErrorType.VariableNotDefined]: "Variable {0} not defined",
    [SemanticErrorType.VariableCalledBeforeDeclaration]:
      "Variable {0} called before declaration",
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
    [SemanticErrorType.FunctionNotDefinedOrCalledBeforeDeclaration]: "{0}",
    [SemanticErrorType.FunctionNotDefined]: "Function {0} not defined",
    [SemanticErrorType.FunctionCalledBeforeDeclaration]:
      "Function {0} called before declaration",
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
    [SemanticErrorType.Error]: "{0}",
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
          this.pushError(SemanticErrorType.Error, [stmt.message], stmt);
          break;
      }
    }

    this.errors = this.errors.map((error) => {
      if (
        error.type ===
        SemanticErrorType.FunctionNotDefinedOrCalledBeforeDeclaration
      ) {
        if (error.object === undefined || isStatement(error.object))
          return error;

        const funcname = error.message;
        const type = this.functions.has(funcname)
          ? SemanticErrorType.FunctionCalledBeforeDeclaration
          : SemanticErrorType.FunctionNotDefined;
        const message = this.messages[type].replace("{0}", funcname);
        const object =
          type == SemanticErrorType.FunctionNotDefined
            ? error.object
            : (findExpressionInStatements(error.object, this.program) ??
              error.object);

        return { ...error, type, object, message };
      }

      if (
        error.type ===
        SemanticErrorType.VariableNotDefinedOrCalledBeforeDeclaration
      ) {
        if (error.object === undefined || isStatement(error.object))
          return error;

        const varname = error.message;
        const type = this.variables.has(varname)
          ? SemanticErrorType.VariableCalledBeforeDeclaration
          : SemanticErrorType.VariableNotDefined;
        const message = this.messages[type].replace("{0}", varname);
        const object =
          type == SemanticErrorType.VariableNotDefined
            ? error.object
            : (findExpressionInStatements(error.object, this.program) ??
              error.object);

        return { ...error, type, object, message };
      }

      return error;
    });

    return this.errors;
  }

  public getVariableNames(): string[] {
    return Array.from(this.variables);
  }
  public getFunctionNames(): string[] {
    return Array.from(this.functions);
  }

  private pushError(
    type: SemanticErrorType,
    replace: string[] | null,
    object: Statement | Expression,
    target: Statement | Expression | undefined = undefined,
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
      target,
    });
  }

  private getVariableStatement(name: string): Statement | undefined {
    return this.program.find((stmt) => {
      if (stmt.type !== StatementType.Variable) return false;
      return stmt.name === name;
    });
  }

  private getFunctionStatement(name: string): Statement | undefined {
    return this.program.find((stmt) => {
      if (
        stmt.type !== StatementType.Function &&
        stmt.type !== StatementType.FunctionTable
      )
        return false;
      return stmt.name === name;
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
        stmt,
      );
    }

    if (this.functions.has(stmt.name)) {
      error = true;
      this.pushError(
        SemanticErrorType.VariableAmbiguousName,
        [stmt.name],
        stmt,
      );
    }

    this.checkExpression(stmt, stmt.value);

    if (!error) {
      this.variables.add(stmt.name);
    }
  }

  private checkFunctionStatement(stmt: Statement) {
    if (stmt.type !== StatementType.Function) return;

    let error = false;
    if (this.functions.has(stmt.name)) {
      error = true;
      this.pushError(
        SemanticErrorType.FunctionAlreadyDeclared,
        [stmt.name],
        stmt,
      );
    }

    if (this.variables.has(stmt.name)) {
      error = true;
      this.pushError(
        SemanticErrorType.FunctionAmbiguousName,
        [stmt.name],
        stmt,
      );
    }

    const hasDuplicateParams = stmt.parameters.some(
      (param, index) => stmt.parameters.indexOf(param) !== index,
    );
    if (hasDuplicateParams) {
      error = true;
      this.pushError(
        SemanticErrorType.FunctionDuplicateParameters,
        [stmt.name],
        stmt,
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
        stmt,
      );
    }

    if (this.variables.has(stmt.name)) {
      error = true;
      this.pushError(
        SemanticErrorType.FunctionAmbiguousName,
        [stmt.name],
        stmt,
      );
    }

    const hasDuplicateParams = stmt.parameters.some(
      (param, index) => stmt.parameters.indexOf(param) !== index,
    );
    if (hasDuplicateParams) {
      error = true;
      this.pushError(
        SemanticErrorType.FunctionDuplicateParameters,
        [stmt.name],
        stmt,
      );
    }

    const hasDuplicateSubParams = stmt.subparameters.some(
      (param, index) => stmt.subparameters.indexOf(param) !== index,
    );
    if (hasDuplicateSubParams) {
      error = true;
      this.pushError(
        SemanticErrorType.FunctionDuplicateSubParameters,
        [stmt.name],
        stmt,
      );
    }

    const expectedLength = Math.pow(2, stmt.parameters.length);

    if (stmt.table.length !== expectedLength) {
      error = true;
      this.pushError(
        SemanticErrorType.FunctionTableInvalidLength,
        [stmt.name, expectedLength.toString(), stmt.table.length.toString()],
        stmt,
      );
    }

    const indexes = new Set<string>();
    for (const row of stmt.table) {
      const index = row.index.value.join("");
      if (indexes.has(index)) {
        error = true;
        this.pushError(
          SemanticErrorType.FunctionTableDuplicateIndexes,
          [index, stmt.name],
          stmt,
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
      Keywords.Input,
    ];
    if (invalidBuiltins.includes(stmt.name)) {
      this.pushError(SemanticErrorType.BuiltinInvalidUsage, [stmt.name], stmt);
      return;
    }

    switch (stmt.name) {
      case Keywords.Input:
      case Keywords.Import:
        if (stmt.parameters.length !== 1) {
          this.pushError(
            SemanticErrorType.BuiltinInvalidParameterLength,
            [stmt.name, "1", stmt.parameters.length.toString()],
            stmt,
          );
          return;
        }

        if (stmt.parameters[0].type !== ExpressionType.String) {
          this.pushError(
            SemanticErrorType.BuiltinInvalidParameterType,
            [stmt.name, "string"],
            stmt,
          );
        }
        break;
      case Keywords.Export:
        if (stmt.parameters.length !== 2) {
          this.pushError(
            SemanticErrorType.BuiltinInvalidParameterLength,
            [stmt.name, "2", stmt.parameters.length.toString()],
            stmt,
          );
          return;
        }
        if (stmt.parameters[0].type !== ExpressionType.String) {
          this.pushError(
            SemanticErrorType.BuiltinInvalidParameterType,
            [stmt.name, "string"],
            stmt,
          );
        }
        this.checkExpression(stmt, stmt.parameters[1], [], stmt.name);
        break;
      case Keywords.Print:
        for (const param of stmt.parameters) {
          this.checkExpression(stmt, param, [], stmt.name);
        }
        break;
      case Keywords.Graph:
      case Keywords.Table:
      case Keywords.Show:
        for (const param of stmt.parameters) {
          this.checkExpression(stmt, param, true, stmt.name);
        }
        break;
    }
  }

  private checkExpression(
    parent: Statement,
    expr: Expression,
    parameters: string[] | boolean = [],
    builtin: Keywords | undefined = undefined,
  ) {
    switch (expr.type) {
      case ExpressionType.Variable:
        this.checkVariableExpression(parent, expr, parameters, builtin);
        break;
      case ExpressionType.FunctionCall:
        this.checkFunctionCallExpression(parent, expr, parameters, undefined);
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
        this.pushError(SemanticErrorType.Error, [expr.message], expr);
        break;
    }
  }

  private checkVariableExpression(
    parent: Statement,
    expr: Expression,
    parameters: string[] | boolean,
    builtin: Keywords | undefined,
  ) {
    if (expr.type !== ExpressionType.Variable) return;
    if (typeof parameters === "boolean") {
      if (expr.reference && !this.variables.has(expr.name)) {
        this.pushError(
          SemanticErrorType.VariableNotDefinedOrCalledBeforeDeclaration,
          [expr.name],
          expr,
          this.getVariableStatement(expr.name),
        );
      }
      return;
    }
    const isFunction = parameters.length > 0;
    const isBuiltin = builtin !== undefined;

    if (isFunction) {
      if (expr.reference && !this.variables.has(expr.name)) {
        this.pushError(
          SemanticErrorType.VariableReferenceNotDefined,
          [expr.name],
          expr,
        );
      }

      if (!expr.reference && !parameters.includes(expr.name)) {
        this.pushError(
          SemanticErrorType.VariableParameterNotDefined,
          [expr.name],
          parent,
          expr,
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
            expr,
          );
        }
        return;
      }
    }

    if (!this.variables.has(expr.name)) {
      this.pushError(
        SemanticErrorType.VariableNotDefinedOrCalledBeforeDeclaration,
        [expr.name],
        expr,
        this.getVariableStatement(expr.name),
      );
    }

    if (expr.reference) {
      this.pushError(SemanticErrorType.VariableReference, [expr.name], expr);
    }
  }

  private checkFunctionCallExpression(
    parent: Statement,
    expr: Expression,
    parameters: string[] | boolean,
    builtin: Keywords | undefined,
  ) {
    if (expr.type !== ExpressionType.FunctionCall) return;

    if (!this.functions.has(expr.name)) {
      this.pushError(
        SemanticErrorType.FunctionNotDefinedOrCalledBeforeDeclaration,
        [expr.name],
        expr,
        this.getFunctionStatement(expr.name),
      );
    }

    for (const param of expr.parameters) {
      this.checkExpression(parent, param, parameters, builtin);
    }
  }

  private checkBuiltinCallExpression(
    parent: Statement,
    expr: Expression,
    parameters: string[] | boolean,
    builtin: Keywords | undefined,
  ) {
    if (expr.type !== ExpressionType.BuiltinCall || builtin === undefined) {
      return;
    }

    const validBuiltins = [
      Keywords.ToNand,
      Keywords.ToNor,
      Keywords.SolvePOS,
      Keywords.SolveSOP,
      Keywords.Input,
    ];
    if (!validBuiltins.includes(builtin)) {
      this.pushError(SemanticErrorType.BuiltinInvalidUsage, [builtin], expr);
      return;
    }

    if (expr.parameters.length !== 1) {
      this.pushError(
        SemanticErrorType.BuiltinInvalidParameterLength,
        [builtin, "1", expr.parameters.length.toString()],
        expr,
      );
      return;
    }

    this.checkExpression(parent, expr.parameters[0], parameters, builtin);
  }

  private checkNumberExpression(
    expr: Expression,
    builtin: Keywords | undefined,
  ) {
    if (expr.type !== ExpressionType.Number) return;

    if (builtin == Keywords.Table) {
      this.pushError(
        SemanticErrorType.BuiltinInvalidParameterType,
        [builtin, "number"],
        expr,
      );
    }
  }

  private checkStringExpression(
    expr: Expression,
    builtin: Keywords | undefined,
  ) {
    if (expr.type !== ExpressionType.String) return;

    const validBuiltins = [
      Keywords.Import,
      Keywords.Export,
      Keywords.Print,
      Keywords.Input,
    ];

    if (builtin == undefined) {
      this.pushError(SemanticErrorType.StringInExpression, [expr.value], expr);
    } else if (!validBuiltins.includes(builtin)) {
      this.pushError(
        SemanticErrorType.BuiltinInvalidParameterType,
        [builtin, "string"],
        expr,
      );
    }
  }
}

export { SemanticErrorAnalyzer, SemanticError, SemanticErrorType };
